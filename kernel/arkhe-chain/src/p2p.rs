use std::sync::Arc;
use std::time::Duration;

use futures::StreamExt;
use libp2p::{
    identity, noise, request_response, tcp, yamux, Multiaddr, PeerId, StreamProtocol, Swarm,
    SwarmBuilder,
};
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;

use crate::{ArkheNode, ChainError};

pub const SYNC_PROTOCOL: &str = "/arkhe/block-sync/1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
enum SyncRequest {
    Tip,
    Block { hash: [u8; 32] },
    Child { parent: [u8; 32] },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct SyncResponse {
    body: Option<Vec<u8>>,
}

type Behaviour = request_response::cbor::Behaviour<SyncRequest, SyncResponse>;

pub struct SyncServer {
    pub local_peer_id: PeerId,
    pub listen_addr: Multiaddr,
    task: JoinHandle<()>,
}

impl Drop for SyncServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

pub async fn spawn_server(node: Arc<ArkheNode>) -> Result<SyncServer, ChainError> {
    let key = node.network_keypair();
    let local_peer_id = node.peer_id();
    let (tx, rx) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        let Ok(mut swarm) = build(key) else {
            return;
        };
        let Ok(listen) = "/ip4/127.0.0.1/tcp/0".parse() else {
            return;
        };
        if swarm.listen_on(listen).is_err() {
            return;
        }
        let mut tx = Some(tx);
        loop {
            match swarm.select_next_some().await {
                libp2p::swarm::SwarmEvent::NewListenAddr { address, .. } => {
                    if let Some(sender) = tx.take() {
                        let _ = sender.send(address);
                    }
                }
                libp2p::swarm::SwarmEvent::Behaviour(event) => {
                    if let request_response::Event::Message {
                        message:
                            request_response::Message::Request {
                                request, channel, ..
                            },
                        ..
                    } = event
                    {
                        let response = answer(&node, request);
                        let _ = swarm.behaviour_mut().send_response(channel, response);
                    }
                }
                _ => {}
            }
        }
    });
    let listen_addr = tokio::time::timeout(Duration::from_secs(5), rx)
        .await
        .map_err(|_| ChainError::P2p("listen-timeout"))?
        .map_err(|_| ChainError::P2p("listen-closed"))?;
    Ok(SyncServer {
        local_peer_id,
        listen_addr,
        task,
    })
}

const MAX_SYNC_BLOCKS: u64 = 128;

#[derive(Clone)]
pub(crate) struct SyncResume {
    pub(crate) remote_tip: [u8; 32],
    pub(crate) cursor: [u8; 32],
    pub(crate) hashes: Vec<[u8; 32]>,
}

/// Import the blocks that link this node to the announced tip.
/// One call walks at most 128 headers. A longer gap keeps the verified cursor
/// and imports nothing until a later call reaches this node. The cursor is
/// kept for the whole gap. A tip that does not extend this node is rejected.
pub async fn sync_canonical(
    node: &ArkheNode,
    addr: Multiaddr,
    peer: PeerId,
) -> Result<u64, ChainError> {
    if !node.accepts_peer(&peer) {
        return Err(ChainError::P2p("peer"));
    }
    let key = node.network_keypair();
    let mut swarm = build(key)?;
    let dial = addr.with(libp2p::multiaddr::Protocol::P2p(peer));
    swarm.dial(dial).map_err(|_| ChainError::P2p("dial"))?;
    match tokio::time::timeout(Duration::from_secs(30), follow(&mut swarm, peer, node)).await {
        Ok(result) => result,
        Err(_) => Err(ChainError::P2p("timeout")),
    }
}

fn answer(node: &ArkheNode, request: SyncRequest) -> SyncResponse {
    let body = match request {
        SyncRequest::Tip => node.tip().ok().map(|tip| tip.to_vec()),
        SyncRequest::Block { hash } => node.encoded_block(&hash).ok().flatten(),
        SyncRequest::Child { parent } => node.canonical_child(&parent).ok().flatten(),
    };
    SyncResponse { body }
}

fn checked_header(expected: [u8; 32], body: &[u8]) -> Result<crate::BlockHeader, ChainError> {
    if body.len() > 2 * 1024 * 1024 || crate::tx::block_hash(body) != expected {
        return Err(ChainError::P2p("hash"));
    }
    let block = crate::decode_block(body)?;
    if crate::encode_block(&block) != body {
        return Err(ChainError::Malformed);
    }
    Ok(block.header)
}

fn linked_child(parent: [u8; 32], body: &[u8]) -> Result<[u8; 32], ChainError> {
    if body.len() > 2 * 1024 * 1024 {
        return Err(ChainError::Malformed);
    }
    let block = crate::decode_block(body)?;
    if crate::encode_block(&block) != body || block.header.parent_hash != parent {
        return Err(ChainError::ParentMismatch);
    }
    let hash = crate::tx::block_hash(body);
    if hash == [0u8; 32] {
        return Err(ChainError::P2p("hash"));
    }
    Ok(hash)
}

enum Stage {
    Tip,
    Back,
    Forward,
}

async fn follow(
    swarm: &mut Swarm<Behaviour>,
    peer: PeerId,
    node: &ArkheNode,
) -> Result<u64, ChainError> {
    let mut request_id = None;
    let mut stage = Stage::Tip;
    let mut announced = [0u8; 32];
    let mut local_tip = [0u8; 32];
    let mut cursor = [0u8; 32];
    let mut expect_parent = [0u8; 32];
    let mut hashes = Vec::new();
    let mut forward_at = 0usize;
    let mut steps = 0u64;
    loop {
        match swarm.select_next_some().await {
            libp2p::swarm::SwarmEvent::ConnectionEstablished { peer_id, .. } if peer_id == peer => {
                if request_id.is_none() {
                    request_id = Some(swarm.behaviour_mut().send_request(&peer, SyncRequest::Tip));
                }
            }
            libp2p::swarm::SwarmEvent::Behaviour(request_response::Event::Message {
                peer: responder,
                message:
                    request_response::Message::Response {
                        request_id: response_id,
                        response,
                    },
                ..
            }) if responder == peer && Some(response_id) == request_id => match stage {
                Stage::Tip => {
                    let hash = response
                        .body
                        .filter(|body| body.len() == 32)
                        .ok_or(ChainError::P2p("tip"))?;
                    announced.copy_from_slice(&hash);
                    local_tip = node.tip()?;
                    if local_tip == announced {
                        node.clear_sync_resume()?;
                        return Ok(0);
                    }
                    if let Some(saved) = node.load_sync_resume(announced)? {
                        hashes = saved.hashes;
                        cursor = saved.cursor;
                    } else {
                        node.clear_sync_resume()?;
                        cursor = announced;
                    }
                    stage = Stage::Back;
                    request_id = Some(
                        swarm
                            .behaviour_mut()
                            .send_request(&peer, SyncRequest::Block { hash: cursor }),
                    );
                }
                Stage::Back => {
                    let Some(body) = response.body else {
                        return Err(ChainError::P2p("fork"));
                    };
                    let header = checked_header(cursor, &body)?;
                    steps = steps.checked_add(1).ok_or(ChainError::Overflow)?;
                    hashes.push(cursor);
                    if header.parent_hash == local_tip {
                        let hash = linked_child(local_tip, &body)?;
                        if hash != cursor {
                            return Err(ChainError::P2p("hash"));
                        }
                        node.clear_sync_resume()?;
                        node.import_block(&body)?;
                        if hashes.len() == 1 {
                            return Ok(1);
                        }
                        forward_at = hashes.len() - 2;
                        expect_parent = cursor;
                        stage = Stage::Forward;
                        request_id = Some(swarm.behaviour_mut().send_request(
                            &peer,
                            SyncRequest::Block {
                                hash: hashes[forward_at],
                            },
                        ));
                        continue;
                    }
                    if header.parent_hash == [0u8; 32] {
                        node.clear_sync_resume()?;
                        return Err(ChainError::P2p("fork"));
                    }
                    if steps == MAX_SYNC_BLOCKS {
                        node.store_sync_resume(SyncResume {
                            remote_tip: announced,
                            cursor: header.parent_hash,
                            hashes,
                        })?;
                        return Err(ChainError::P2p("sync-limit"));
                    }
                    cursor = header.parent_hash;
                    request_id = Some(
                        swarm
                            .behaviour_mut()
                            .send_request(&peer, SyncRequest::Block { hash: cursor }),
                    );
                }
                Stage::Forward => {
                    let Some(body) = response.body else {
                        return Err(ChainError::P2p("missing-block"));
                    };
                    let hash = linked_child(expect_parent, &body)?;
                    if hash != hashes[forward_at] {
                        return Err(ChainError::P2p("hash"));
                    }
                    node.import_block(&body)?;
                    expect_parent = hash;
                    if forward_at == 0 {
                        node.clear_sync_resume()?;
                        return u64::try_from(hashes.len()).map_err(|_| ChainError::Overflow);
                    }
                    forward_at -= 1;
                    request_id = Some(swarm.behaviour_mut().send_request(
                        &peer,
                        SyncRequest::Block {
                            hash: hashes[forward_at],
                        },
                    ));
                }
            },
            libp2p::swarm::SwarmEvent::Behaviour(request_response::Event::OutboundFailure {
                peer: responder,
                error,
                ..
            }) if responder == peer => {
                return Err(ChainError::P2p(outbound_reason(error)));
            }
            _ => {}
        }
    }
}

fn outbound_reason(error: request_response::OutboundFailure) -> &'static str {
    match error {
        request_response::OutboundFailure::DialFailure => "dial-failure",
        request_response::OutboundFailure::Timeout => "rr-timeout",
        request_response::OutboundFailure::ConnectionClosed => "connection-closed",
        request_response::OutboundFailure::UnsupportedProtocols => "unsupported-protocol",
        request_response::OutboundFailure::Io(_) => "io",
    }
}

fn build(key: identity::Keypair) -> Result<Swarm<Behaviour>, ChainError> {
    Ok(SwarmBuilder::with_existing_identity(key)
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )
        .map_err(|_| ChainError::P2p("transport"))?
        .with_behaviour(|_| {
            request_response::cbor::Behaviour::new(
                [(
                    StreamProtocol::new(SYNC_PROTOCOL),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            )
        })
        .map_err(|err| match err {})?
        .with_swarm_config(|config| config.with_idle_connection_timeout(Duration::from_secs(10)))
        .build())
}
