use std::collections::BTreeSet;
use std::error::Error;
use std::sync::LazyLock;

use netlink_packet_core::{
    NLM_F_DUMP, NLM_F_REQUEST, NetlinkHeader, NetlinkMessage, NetlinkPayload,
};
use netlink_packet_sock_diag::inet::{ExtensionFlags, InetRequest, SocketId, StateFlags};
use netlink_packet_sock_diag::{SockDiagMessage, constants::*};
use netlink_sys::{
    AsyncSocket, AsyncSocketExt, SocketAddr, TokioSocket, protocols::NETLINK_SOCK_DIAG,
};
use parking_lot::Mutex;

pub type Ports = BTreeSet<u16>;
pub type PortScanResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

static SCANNER: LazyLock<Mutex<PortScanner>> = LazyLock::new(|| {
    Mutex::new(
        PortScanner::new().unwrap_or_else(|err| panic!("failed to initialize PortScanner: {err}")),
    )
});

pub async fn scan_ports() -> PortScanResult<PortSnapshot> {
    SCANNER.lock().snapshot().await
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PortSnapshot {
    pub tcp4: Ports,
    pub udp4: Ports,
    pub tcp6: Ports,
    pub udp6: Ports,
}

struct PortScanner {
    socket: TokioSocket,
    request_seq: u32,
}

impl PortScanner {
    pub fn new() -> PortScanResult<Self> {
        let mut socket = <TokioSocket as AsyncSocket>::new(NETLINK_SOCK_DIAG)?;
        socket.socket_mut().bind_auto()?;
        socket.socket_ref().connect(&SocketAddr::new(0, 0))?;

        Ok(Self {
            socket,
            request_seq: 0,
        })
    }

    pub async fn occupied_ports(&mut self, family: u8, protocol: u8) -> PortScanResult<Ports> {
        self.request_seq = self.request_seq.wrapping_add(1);

        let mut header = NetlinkHeader::default();
        header.flags = NLM_F_REQUEST | NLM_F_DUMP;
        header.sequence_number = self.request_seq;

        let mut request = NetlinkMessage::new(
            header,
            SockDiagMessage::InetRequest(InetRequest {
                family,
                protocol,
                extensions: ExtensionFlags::empty(),
                states: StateFlags::all(),
                socket_id: SocketId::new_v4(),
            })
            .into(),
        );
        request.finalize();

        let mut send_buf = vec![0; request.buffer_len()];
        request.serialize(&mut send_buf);
        self.socket.send(&send_buf).await?;

        let mut ports = BTreeSet::new();

        loop {
            let (recv_buf, _) = self.socket.recv_from_full().await?;
            let size = recv_buf.len();
            let mut offset = 0;

            while offset < size {
                let bytes = &recv_buf[offset..size];
                let message = NetlinkMessage::<SockDiagMessage>::deserialize(bytes)?;
                let length = message.header.length as usize;

                if length == 0 {
                    return Err("received zero-length netlink message".into());
                }

                offset += length;

                if message.header.sequence_number != self.request_seq {
                    continue;
                }

                match message.payload {
                    NetlinkPayload::InnerMessage(SockDiagMessage::InetResponse(response)) => {
                        ports.insert(response.header.socket_id.source_port);
                    }
                    NetlinkPayload::Done(_) => return Ok(ports),
                    NetlinkPayload::Error(err) => {
                        return Err(format!("netlink error: {err:?}").into());
                    }
                    NetlinkPayload::Noop => {}
                    _ => {}
                }
            }
        }
    }

    pub async fn snapshot(&mut self) -> PortScanResult<PortSnapshot> {
        Ok(PortSnapshot {
            tcp4: self.occupied_ports(AF_INET, IPPROTO_TCP).await?,
            udp4: self.occupied_ports(AF_INET, IPPROTO_UDP).await?,
            tcp6: self.occupied_ports(AF_INET6, IPPROTO_TCP).await?,
            udp6: self.occupied_ports(AF_INET6, IPPROTO_UDP).await?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[tokio::test]
    async fn prints_snapshot_like_old_main() -> PortScanResult<()> {
        let mut scanner = PortScanner::new()?;
        let start = Instant::now();
        let snapshot = scanner.snapshot().await?;
        let elapsed = start.elapsed();

        println!("tcp4: {:?}", snapshot.tcp4);
        println!("udp4: {:?}", snapshot.udp4);
        println!("tcp6: {:?}", snapshot.tcp6);
        println!("udp6: {:?}", snapshot.udp6);
        println!("elapsed: {:?}", elapsed);

        Ok(())
    }
}
