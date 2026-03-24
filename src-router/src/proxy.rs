use crate::{config, port_scanner, router, utils::check_basic_auth};
use async_trait::async_trait;
use const_format::formatcp;
use parking_lot::RwLock;
use pingora::{
    Error, ErrorType, Result,
    http::ResponseHeader,
    proxy::{ProxyHttp, Session},
    upstreams::peer::HttpPeer,
};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::LazyLock,
    time::{SystemTime, UNIX_EPOCH},
};

const ROUTER_HTML: &str = include_str!("routes.html");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RouteEntry {
    token: String,
    port: u16,
    public_url: String,
    created_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RoutesPayload {
    routes: Vec<RouteEntry>,
    preview_port: Option<u16>,
    preview_domain: Option<String>,
}

static ROUTES: LazyLock<RwLock<BTreeMap<u16, RouteEntry>>> =
    LazyLock::new(|| RwLock::new(BTreeMap::new()));

#[derive(Default)]
pub struct MainProxy;

async fn write_unauthorized_response(session: &mut Session) -> Result<()> {
    const UNAUTHORIZED_BODY: &str = "Unauthorized";
    const UNAUTHORIZED_LEN: usize = UNAUTHORIZED_BODY.len();
    const UNAUTHORIZED_LEN_STR: &str = formatcp!("{UNAUTHORIZED_LEN}");

    let mut header = ResponseHeader::build(401, Some(UNAUTHORIZED_LEN))?;
    header.append_header("content-type", "text/plain; charset=utf-8")?;
    header.append_header("content-length", UNAUTHORIZED_LEN_STR)?;
    header.append_header("www-authenticate", "Basic")?;
    session
        .write_response_header(Box::new(header), false)
        .await?;
    session
        .write_response_body(Some(UNAUTHORIZED_BODY.into()), true)
        .await?;
    Ok(())
}

fn now_unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn update_routes_from_ports(ports: &std::collections::BTreeSet<u16>) {
    let mut routes = ROUTES.write();

    for port in ports {
        if routes.contains_key(port) {
            continue;
        }
        let token = crate::utils::generate_router_token(config::token_length());
        routes.insert(
            *port,
            RouteEntry {
                token,
                port: *port,
                public_url: String::new(),
                created_at: now_unix_seconds(),
            },
        );
    }

    let stale_ports: Vec<u16> = routes
        .keys()
        .copied()
        .filter(|port| !ports.contains(port))
        .collect();
    for port in stale_ports {
        routes.remove(&port);
    }
}

async fn build_routes_payload() -> RoutesPayload {
    let mut ports = std::collections::BTreeSet::new();
    if let Ok(snapshot) = port_scanner::scan_ports().await {
        ports.extend(snapshot.tcp4);
        ports.extend(snapshot.tcp6);
    }
    update_routes_from_ports(&ports);

    let mut routes: Vec<RouteEntry> = ROUTES.read().values().cloned().collect();
    routes.sort_by(|a, b| a.token.cmp(&b.token));

    RoutesPayload {
        routes,
        preview_port: None,
        preview_domain: None,
    }
}

async fn write_routes_json(session: &mut Session) -> Result<()> {
    let payload = build_routes_payload().await;
    let body = serde_json::to_string(&payload).map_err(|err| {
        Error::explain(
            ErrorType::InternalError,
            format!("Failed to encode routes JSON: {err}"),
        )
    })?;

    let mut header = ResponseHeader::build(200, Some(body.len()))?;
    header.append_header("content-type", "application/json; charset=utf-8")?;
    header.append_header("content-length", body.len().to_string())?;
    header.append_header("cache-control", "no-cache, no-store, must-revalidate")?;
    header.append_header("pragma", "no-cache")?;
    session
        .write_response_header(Box::new(header), false)
        .await?;
    session.write_response_body(Some(body.into()), true).await?;
    Ok(())
}

async fn write_routes_html(session: &mut Session) -> Result<()> {
    let payload = build_routes_payload().await;
    let data = serde_json::to_string(&payload).map_err(|err| {
        Error::explain(
            ErrorType::InternalError,
            format!("Failed to encode routes JSON: {err}"),
        )
    })?;
    let body = ROUTER_HTML.replace("__INITIAL_DATA__", &data);

    let mut header = ResponseHeader::build(200, Some(body.len()))?;
    header.append_header("content-type", "text/html; charset=utf-8")?;
    header.append_header("content-length", body.len().to_string())?;
    session
        .write_response_header(Box::new(header), false)
        .await?;
    session.write_response_body(Some(body.into()), true).await?;
    Ok(())
}

fn extract_path_and_query<'a>(session: &'a Session) -> (&'a str, Option<&'a str>) {
    let uri = &session.req_header().uri;
    let path = uri.path();
    if !path.is_empty() {
        return (path, uri.query());
    }

    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("");
    let mut parts = path_and_query.splitn(2, '?');
    let path_only = parts.next().unwrap_or("");
    let query = parts.next();
    (path_only, query)
}

#[async_trait]
impl ProxyHttp for MainProxy {
    type CTX = ();
    fn new_ctx(&self) -> Self::CTX {}

    async fn request_filter(&self, session: &mut Session, _: &mut Self::CTX) -> Result<bool> {
        let (path, query) = extract_path_and_query(session);
        if path != "/routes" && path != "/routes/" {
            return Ok(false);
        }

        if !check_basic_auth(session.req_header().headers.get("authorization")) {
            write_unauthorized_response(session).await?;
            return Ok(true);
        }

        if let Some(query) = query
            && query == "format=json"
        {
            write_routes_json(session).await?;
            return Ok(true);
        }

        write_routes_html(session).await?;
        Ok(true)
    }

    async fn upstream_peer(
        &self,
        session: &mut Session,
        _: &mut Self::CTX,
    ) -> Result<Box<HttpPeer>> {
        let path = session.req_header().uri.path();
        match router::find(path) {
            Some(addr) => Ok(Box::new(HttpPeer::new(addr, false, "".to_string()))),
            None => Err(Error::explain(
                ErrorType::HTTPStatus(404),
                format!("No route found for path: {path}"),
            )),
        }
    }
}
