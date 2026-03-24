use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use http::HeaderValue;

use crate::config;
use crate::router;

// 生成随机TOKEN
pub fn generate_router_token(length: usize) -> String {
    use rand::distr::{Alphanumeric, Distribution};

    let mut token: String;

    loop {
        token = Alphanumeric
            .sample_iter(rand::rng())
            .take(length)
            .map(char::from)
            .collect();
        if router::find(&format!("/{}", token)).is_none() {
            break;
        }
    }

    token
}

pub fn check_basic_auth(auth_raw: Option<&HeaderValue>) -> bool {
    if config::router_password().is_empty() {
        return true;
    }

    if let Some(auth_value) = auth_raw
        && let Ok(auth_str) = auth_value.to_str()
        && auth_str.len() > 6
        && auth_str[..6].eq_ignore_ascii_case("basic ")
        && let Some((_, auth_base64)) = auth_str.split_once(' ')
        && let Ok(auth_decoded) = BASE64_STANDARD.decode(auth_base64)
        && let Ok(auth_decoded_str) = str::from_utf8(&auth_decoded)
        && let Some((username, password)) = auth_decoded_str.split_once(':')
        && username == config::router_username()
        && password == config::router_password()
    {
        true
    } else {
        false
    }
}
