use std::{env, sync::LazyLock, time::Duration};

static CONFIG: LazyLock<Config> = LazyLock::new(Config::new);

pub fn router_host_v6() -> &'static str {
    &CONFIG.router_host_v6
}

pub fn router_host() -> &'static str {
    &CONFIG.router_host
}

pub fn router_port() -> u16 {
    CONFIG.router_port
}

pub fn router_state_file() -> &'static str {
    &CONFIG.router_state_file
}

pub fn router_username() -> &'static str {
    &CONFIG.router_username
}

pub fn router_password() -> &'static str {
    &CONFIG.router_password
}

pub fn scan_interval() -> Duration {
    CONFIG.scan_interval
}

pub fn token_length() -> usize {
    CONFIG.token_length
}

pub fn port_range() -> (u16, u16) {
    CONFIG.port_range
}

struct Config {
    router_host: String,
    router_host_v6: String,
    router_state_file: String,
    router_username: String,
    router_password: String,
    scan_interval: Duration,
    token_length: usize,
    port_range: (u16, u16),
    router_port: u16,
}

impl Config {
    fn new() -> Self {
        Self {
            router_host: env::var("ROUTER_HOST").unwrap_or("0.0.0.0".to_string()),
            router_host_v6: env::var("ROUTER_HOST_V6").unwrap_or("::1".to_string()),
            router_port: env::var("ROUTER_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(7070),
            router_state_file: env::var("ROUTER_STATE_FILE").unwrap_or("./routes.json".to_string()),
            router_username: env::var("ROUTER_USERNAME").unwrap_or("".to_string()),
            router_password: env::var("ROUTER_PASSWORD").unwrap_or("".to_string()),
            scan_interval: env::var("SCAN_INTERVAL")
                .ok()
                .and_then(|s| s.parse().ok())
                .map(Duration::from_secs)
                .unwrap_or(Duration::from_secs(5)),
            token_length: env::var("TOKEN_LENGTH")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(12),
            port_range: env::var("PORT_RANGE")
                .ok()
                .and_then(|rg_str| {
                    rg_str.split_once('-').and_then(|(start, end)| {
                        let start = start.trim().parse().ok()?;
                        let end = end.trim().parse().ok()?;
                        Some((start, end))
                    })
                })
                .unwrap_or((3000, 9999)),
        }
    }
}
