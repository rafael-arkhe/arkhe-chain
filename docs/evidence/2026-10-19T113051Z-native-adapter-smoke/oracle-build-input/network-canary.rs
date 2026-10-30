//! Trusted external fixture: private TCP/UDP echo and fixed DNS response only.
use std::{
    env,
    io::{self, Read, Write},
    net::{TcpListener, UdpSocket},
    thread,
    time::{Duration, Instant},
};
#[path = "network-wire.rs"]
mod wire;
fn log(run: &str, event: &str, protocol: &str, nonce: &str, time: u128) {
    println!("{{\"run_id\":\"{}\",\"event\":\"{}\",\"protocol\":\"{}\",\"nonce\":\"{}\",\"elapsed_ms\":{}}}",run,event,protocol,nonce,time);
}
fn main() -> io::Result<()> {
    let run = env::args().nth(1).expect("run ID required");
    assert!(run.len() == 36 && run.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-'));
    let tcp = TcpListener::bind("0.0.0.0:18080")?;
    let udp = UdpSocket::bind("0.0.0.0:18081")?;
    let dns = UdpSocket::bind("0.0.0.0:15353")?;
    tcp.set_nonblocking(true)?;
    udp.set_nonblocking(true)?;
    dns.set_nonblocking(true)?;
    let start = Instant::now();
    let mut beat = Instant::now();
    log(&run, "ready", "", "", 0);
    while start.elapsed() < Duration::from_secs(170) {
        if beat.elapsed() >= Duration::from_millis(500) {
            log(&run, "heartbeat", "", "", start.elapsed().as_millis());
            beat = Instant::now();
        }
        match tcp.accept() {
            Ok((mut stream, _)) => {
                stream.set_read_timeout(Some(Duration::from_millis(300)))?;
                stream.set_write_timeout(Some(Duration::from_millis(300)))?;
                let mut buffer = [0u8; 64];
                if stream.read_exact(&mut buffer).is_ok() {
                    let nonce = String::from_utf8_lossy(&buffer);
                    if wire::valid_nonce(&nonce) {
                        stream.write_all(&buffer)?;
                        log(&run, "received", "tcp", &nonce, start.elapsed().as_millis());
                    } else {
                        log(&run, "error", "tcp", "", start.elapsed().as_millis());
                    }
                } else {
                    log(&run, "error", "tcp", "", start.elapsed().as_millis());
                }
            }
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => {}
            Err(e) => return Err(e),
        }
        for (socket, protocol) in [(&udp, "udp"), (&dns, "dns")] {
            let mut buffer = [0u8; 512];
            match socket.recv_from(&mut buffer) {
                Ok((count, peer)) => {
                    let data = &buffer[..count];
                    let nonce = if protocol == "dns" {
                        wire::query_nonce(data)
                    } else {
                        std::str::from_utf8(data)
                            .ok()
                            .filter(|s| wire::valid_nonce(s))
                            .map(str::to_string)
                    };
                    if let Some(nonce) = nonce {
                        let reply = if protocol == "dns" {
                            wire::dns_reply(data)
                        } else {
                            data.to_vec()
                        };
                        socket.send_to(&reply, peer)?;
                        log(
                            &run,
                            "received",
                            protocol,
                            &nonce,
                            start.elapsed().as_millis(),
                        );
                    } else {
                        log(&run, "error", protocol, "", start.elapsed().as_millis());
                    }
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {}
                Err(e) => return Err(e),
            }
        }
        thread::sleep(Duration::from_millis(10));
    }
    log(&run, "expired", "", "", start.elapsed().as_millis());
    Ok(())
}
