use matchit::{InsertError, Router};
use parking_lot::RwLock;
use std::{
    error::Error,
    fmt::Display,
    net::{SocketAddr, ToSocketAddrs},
    sync::LazyLock,
};

static ROUTER: LazyLock<RwLock<Router<SocketAddr>>> = LazyLock::new(|| RwLock::new(Router::new()));

#[derive(Debug)]
pub enum RouterError {
    Insert(InsertError),
    Addr(std::io::Error),
}

impl Display for RouterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RouterError::Insert(err) => write!(f, "{err}"),
            RouterError::Addr(err) => write!(f, "{err}"),
        }
    }
}

impl Error for RouterError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            RouterError::Insert(err) => Some(err),
            RouterError::Addr(err) => Some(err),
        }
    }
}

impl From<InsertError> for RouterError {
    fn from(err: InsertError) -> Self {
        RouterError::Insert(err)
    }
}

impl From<std::io::Error> for RouterError {
    fn from(err: std::io::Error) -> Self {
        RouterError::Addr(err)
    }
}

pub fn insert<A>(path: &str, addrs: A) -> Result<(), RouterError>
where
    A: ToSocketAddrs,
{
    let mut router = ROUTER.write();

    for addr in addrs.to_socket_addrs()? {
        router.insert(path, addr)?;
    }

    Ok(())
}

pub fn find(path: &str) -> Option<SocketAddr> {
    let router = ROUTER.read();
    router.at(path).ok().map(|m| *m.value)
}

pub fn remove(path: &str) -> Option<SocketAddr> {
    let mut router = ROUTER.write();
    router.remove(path)
}
