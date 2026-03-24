mod config;
mod port_scanner;
mod proxy;
mod router;
mod utils;

use pingora::{
    proxy::http_proxy_service,
    server::{Server, configuration::ServerConf},
};
use proxy::MainProxy;
use std::sync::Arc;

fn main() {
    env_logger::init();
    let server_conf = Arc::new(ServerConf::default());
    let mut proxy_service = http_proxy_service(&server_conf, MainProxy);
    proxy_service.add_tcp(&format!(
        "{}:{}",
        config::router_host(),
        config::router_port()
    ));
    proxy_service.add_tcp(&format!(
        "{}:{}",
        config::router_host_v6(),
        config::router_port()
    ));

    let mut server =
        Server::new(None).unwrap_or_else(|err| panic!("Failed to create server: {err}"));
    server.bootstrap();
    server.add_services(vec![Box::new(proxy_service)]);

    log::info!(
        "Router is running on {}:{} and [{}]:{}",
        config::router_host(),
        config::router_port(),
        config::router_host_v6(),
        config::router_port()
    );

    server.run_forever();
}
