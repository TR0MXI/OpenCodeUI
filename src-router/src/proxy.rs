use crate::{router, utils::check_basic_auth};
use async_trait::async_trait;
use const_format::formatcp;
use pingora::{
    Error, ErrorType, Result,
    http::ResponseHeader,
    proxy::{ProxyHttp, Session},
    upstreams::peer::HttpPeer,
};

#[derive(Default)]
pub struct MainProxy;

#[async_trait]
impl ProxyHttp for MainProxy {
    type CTX = ();
    fn new_ctx(&self) -> Self::CTX {}

    async fn request_filter(&self, session: &mut Session, _: &mut Self::CTX) -> Result<bool> {
        const ROUTER_HTML: &str = include_str!("routes.html");
        const ROUTER_HTML_LEN: usize = ROUTER_HTML.len();
        static ROUTER_HTML_LEN_STR: &str = formatcp!("{ROUTER_HTML_LEN}");

        let path = session.req_header().uri.path();
        if path != "/routes" && path != "/routes/" {
            return Ok(false);
        }

        if !check_basic_auth(session.req_header().headers.get("authorization")) {
            const UNAUTHORIZED_BODY: &str = "Unauthorized";
            const UNAUTHORIZED_LEN: usize = UNAUTHORIZED_BODY.len();
            static UNAUTHORIZED_LEN_STR: &str = formatcp!("{UNAUTHORIZED_LEN}");

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

            return Ok(true);
        }

        if let Some(query) = session.req_header().uri.query()
            && query == "format=json"
        {}

        let mut header = ResponseHeader::build(200, Some(ROUTER_HTML_LEN))?;
        header.append_header("content-type", "text/html; charset=utf-8")?;
        header.append_header("content-length", ROUTER_HTML_LEN_STR)?;
        session
            .write_response_header(Box::new(header), false)
            .await?;
        session
            .write_response_body(Some(ROUTER_HTML.into()), true)
            .await?;

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
