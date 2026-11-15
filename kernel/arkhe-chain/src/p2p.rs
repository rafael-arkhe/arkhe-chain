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
pub const PRECOMMIT_PROTOCOL: &str = "/arkhe/precommit/1";
pub const TX_PROTOCOL: &str = "/arkhe/tx/1";
const TX_BODY_LIMIT: usize = 16 * 1024;
const VOTE_REQUEST_LIMIT: usize = 1024 * 1024;
const VOTE_ENVELOPE_BUDGET: usize = 4096;
const VOTE_BLOCK_LIMIT: usize = VOTE_REQUEST_LIMIT - VOTE_ENVELOPE_BUDGET;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
enum SyncRequest {
    Tip,
    Block { hash: [u8; 32] },
    Child { parent: [u8; 32] },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct SyncResponse {
    body: Option<Vec<u8>>,
    #[serde(default)]
    genesis: Option<[u8; 32]>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct VoteRequest {
    validator_id: String,
    height: u64,
    round: u64,
    block_hash: [u8; 32],
    parts: u32,
    part_hash: [u8; 32],
    chain_id: String,
    signature: Vec<u8>,
    genesis: [u8; 32],
    #[serde(default)]
    block: Option<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct VoteReply {
    stored: bool,
    reason: Option<String>,
    committed: u64,
    echo: Option<VoteRequest>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct TxRequest {
    genesis: [u8; 32],
    body: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct TxReply {
    ingested: bool,
    reason: Option<String>,
}

#[derive(libp2p::swarm::NetworkBehaviour)]
struct NodeBehaviour {
    sync: request_response::cbor::Behaviour<SyncRequest, SyncResponse>,
    vote: request_response::cbor::Behaviour<VoteRequest, VoteReply>,
    tx: request_response::cbor::Behaviour<TxRequest, TxReply>,
}

pub(crate) struct RemoteSeal {
    pub(crate) timestamp: u64,
    pub(crate) secret: [u8; 32],
    pub(crate) peers: Vec<ConfiguredPeer>,
}

type Behaviour = NodeBehaviour;

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
    let listen = "/ip4/127.0.0.1/tcp/0"
        .parse()
        .map_err(|_| ChainError::P2p("listen"))?;
    spawn_server_on(node, listen).await
}

/// Listen on `listen`. The address must not already name a peer id.
/// A refused bind is `P2p("listen-closed")`. This does not discover peers.
pub async fn spawn_server_on(
    node: Arc<ArkheNode>,
    listen: Multiaddr,
) -> Result<SyncServer, ChainError> {
    listen_on(node, listen, None).await
}

pub(crate) async fn listen_on(
    node: Arc<ArkheNode>,
    listen: Multiaddr,
    seal: Option<RemoteSeal>,
) -> Result<SyncServer, ChainError> {
    if listen.iter().any(|protocol| {
        matches!(protocol, libp2p::multiaddr::Protocol::P2p(_))
    }) {
        return Err(ChainError::P2p("listen"));
    }
    let key = node.network_keypair();
    let local_peer_id = node.peer_id();
    let (tx, rx) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        let Ok(mut swarm) = build(key) else {
            return;
        };
        if swarm.listen_on(listen).is_err() {
            return;
        }
        let mut tx = Some(tx);
        let seal = seal;
        loop {
            match swarm.select_next_some().await {
                libp2p::swarm::SwarmEvent::NewListenAddr { address, .. } => {
                    if let Some(sender) = tx.take() {
                        let _ = sender.send(address);
                    }
                }
                libp2p::swarm::SwarmEvent::Behaviour(NodeBehaviourEvent::Sync(event)) => {
                    if let request_response::Event::Message {
                        message:
                            request_response::Message::Request {
                                request, channel, ..
                            },
                        ..
                    } = event
                    {
                        let response = answer(&node, request);
                        let _ = swarm.behaviour_mut().sync.send_response(channel, response);
                    }
                }
                libp2p::swarm::SwarmEvent::Behaviour(NodeBehaviourEvent::Vote(event)) => {
                    if let request_response::Event::Message {
                        message:
                            request_response::Message::Request {
                                request, channel, ..
                            },
                        ..
                    } = event
                    {
                        let response = answer_vote(&node, request);
                        let _ = swarm.behaviour_mut().vote.send_response(channel, response);
                    }
                }
                libp2p::swarm::SwarmEvent::Behaviour(NodeBehaviourEvent::Tx(event)) => {
                    if let request_response::Event::Message {
                        message:
                            request_response::Message::Request {
                                request, channel, ..
                            },
                        ..
                    } = event
                    {
                        let response = answer_tx(&node, &seal, request).await;
                        let _ = swarm.behaviour_mut().tx.send_response(channel, response);
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
    /// Newest first. Each body was checked against its hash during the walk.
    pub(crate) blocks: Vec<([u8; 32], Vec<u8>)>,
}

/// Import the blocks that link this node to the announced tip.
/// One call walks at most 128 headers toward this node. A longer gap keeps
/// those checked bodies and imports nothing until a later call reaches this
/// node. The linking call imports the retained bodies, oldest first, and does
/// not request them again. A tip that does not extend this node is rejected.
/// The node's own peer id is `P2p("self")` and is not dialed.
/// A remote tip that is already a canonical block on this node returns 0.
/// The local tip stays and no sibling is stored. A sibling of a canonical
/// block is stored as `Fork`, the call returns 0, and the tip stays.
/// The same proposer at the same height is `Equivocation` and is not stored.
pub async fn sync_canonical(
    node: &ArkheNode,
    addr: Multiaddr,
    peer: PeerId,
) -> Result<u64, ChainError> {
    match sync_one(node, addr, peer).await? {
        Heard::Count(count) => Ok(count),
        Heard::Behind => Ok(0),
    }
}

async fn sync_one(
    node: &ArkheNode,
    addr: Multiaddr,
    peer: PeerId,
) -> Result<Heard, ChainError> {
    if peer == node.peer_id() {
        return Err(ChainError::P2p("self"));
    }
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

/// Sign round 0 for each local height above the committed one, store that
/// vote, and send it to `peers` in order. The walk stops when the next block
/// is missing. A height that does not commit does not stop the walk: the
/// next local block is still sent. `bft_commit` of a height above the next
/// uncommitted one stays `CommitGap`. The committed height stays. The tip
/// hash does not change. A peer
/// that does not have the block yet answers `unknown`. A sibling stored from
/// the vote body answers `fork`. The local vote stays and the process
/// continues. A named peer that does not answer within 30 seconds does not
/// end this walk. A dial the peer refuses does not end this walk and does
/// not wait 30 seconds. A connection that closes during the request does
/// not end this walk. A request that is not answered within 10 seconds does
/// not end this walk. A response the codec cannot read does not end this
/// walk. Those peers are not dialed again in this call. A named peer whose genesis differs does not end it either.
/// Those peers are not dialed again in this call. A peer id that is not a
/// validator does not end this walk and is not dialed again in this call. If
/// no named peer accepts a vote, an unanswered peer yields `P2p("timeout")`,
/// a refused dial yields `P2p("dial-failure")`, a connection that closes
/// yields `P2p("connection-closed")`, a request that is not answered yields
/// `P2p("rr-timeout")`, a response the codec cannot read yields `P2p("io")`,
/// a different genesis yields `P2p("genesis")`, a peer that does not speak
/// the protocol yields `P2p("unsupported-protocol")`, and an outsider yields
/// `P2p("peer")`. When another named peer accepts a vote, this function still
/// returns the committed height. The operator fails that pass. The local vote stays. Votes learned from the named peers are then forwarded to that
/// same list, so a third validator records a vote it did not hear directly.
/// It does not open a later round, does not change the tip hash, and does not
/// discover peers. An empty peer list only stores the local vote. Two votes
/// among three validators do not commit.
pub async fn attest_configured(
    node: &ArkheNode,
    secret: &[u8; 32],
    peers: &[ConfiguredPeer],
) -> Result<u64, ChainError> {
    attest_pass(node, secret, peers)
        .await
        .map(|pass| pass.committed)
}

pub(crate) struct AttestPass {
    pub committed: u64,
    /// True when a named peer refused a vote because the genesis differed.
    /// Another named peer may still have accepted a vote. The public call
    /// returns the committed height. The operator fails the pass.
    pub foreign_genesis: bool,
    /// True when a named peer refused a vote because the chain id differed.
    /// Another named peer may still have accepted a vote. The public call
    /// returns the committed height. The operator fails the pass. The tip
    /// hash does not change.
    pub foreign_chain: bool,
    /// True when a named peer refused a vote because the part set differed.
    /// Another named peer may still have accepted a vote. The public call
    /// returns the committed height. The operator fails the pass. The tip
    /// hash does not change.
    pub bad_part: bool,
    /// True when a named peer refused a vote because the round went
    /// backwards. Another named peer may still have accepted a vote. The
    /// public call returns the committed height. The operator fails the
    /// pass. The tip hash does not change.
    pub round_regression: bool,
    /// True when a named peer refused a vote because the proposer signature
    /// did not verify. Another named peer may still have accepted a vote.
    /// The public call returns the committed height. The operator fails the
    /// pass. The tip hash does not change.
    pub bad_signature: bool,
    /// True when a named peer refused a vote because the signer is not the
    /// proposer. Another named peer may still have accepted a vote. The
    /// public call returns the committed height. The operator fails the
    /// pass. The tip hash does not change.
    pub bad_proposer: bool,
    /// True when a named peer refused a vote for a reason that is not a
    /// named chain error. Another named peer may still have accepted a vote.
    /// The public call returns the committed height. The operator fails the
    /// pass. The tip hash does not change.
    pub refused_vote: bool,
}

pub(crate) async fn attest_pass(
    node: &ArkheNode,
    secret: &[u8; 32],
    peers: &[ConfiguredPeer],
) -> Result<AttestPass, ChainError> {
    let mut height = node.committed_height()?.saturating_add(1);
    let mut saw_foreign = false;
    let mut saw_chain = false;
    let mut saw_part = false;
    let mut saw_round = false;
    let mut saw_signature = false;
    let mut saw_proposer = false;
    let mut saw_refused = false;
    loop {
        let hash = match node.block_hash_at(height) {
            Ok(hash) => hash,
            Err(ChainError::UnknownBlock) => {
                return Ok(AttestPass {
                    committed: node.committed_height()?,
                    foreign_genesis: saw_foreign,
                    foreign_chain: saw_chain,
                    bad_part: saw_part,
                    round_regression: saw_round,
                    bad_signature: saw_signature,
                    bad_proposer: saw_proposer,
                    refused_vote: saw_refused,
                })
            }
            Err(error) => return Err(error),
        };
        let mut vote = crate::Precommit {
            validator_id: node.node_id().to_string(),
            height,
            round: 0,
            parts: 1,
            part_hash: hash,
            chain_id: crate::CHAIN_ID.to_string(),
            block_hash: hash,
            signature: [0u8; 64],
        };
        crate::sign_precommit(&mut vote, secret)?;
        node.note_precommit(&vote)?;
        let _ = node.bft_commit(height);
        let mut unanswered = Vec::new();
        let mut refused = Vec::new();
        let mut closed = Vec::new();
        let mut stalled = Vec::new();
        let mut unreadable = Vec::new();
        let mut foreign = Vec::new();
        let mut chains = Vec::new();
        let mut parts = Vec::new();
        let mut rounds = Vec::new();
        let mut signatures = Vec::new();
        let mut proposers = Vec::new();
        let mut refused_votes = Vec::new();
        let mut silent = Vec::new();
        let mut outsiders = Vec::new();
        let mut reached = false;
        for peer in peers {
            deliver_configured(
                node,
                peer,
                &vote,
                &mut unanswered,
                &mut refused,
                &mut closed,
                &mut stalled,
                &mut unreadable,
                &mut foreign,
                &mut chains,
                &mut parts,
                &mut rounds,
                &mut signatures,
                &mut proposers,
                &mut refused_votes,
                &mut silent,
                &mut outsiders,
                &mut reached,
            )
            .await?;
        }
        for stored in node.precommits_at(height)? {
            if stored.validator_id == node.node_id() {
                continue;
            }
            for peer in peers {
                deliver_configured(
                    node,
                    peer,
                    &stored,
                    &mut unanswered,
                    &mut refused,
                    &mut closed,
                    &mut stalled,
                    &mut unreadable,
                    &mut foreign,
                    &mut chains,
                    &mut parts,
                    &mut rounds,
                    &mut signatures,
                    &mut proposers,
                    &mut refused_votes,
                    &mut silent,
                    &mut outsiders,
                    &mut reached,
                )
                .await?;
            }
        }
        if !foreign.is_empty() {
            saw_foreign = true;
        }
        if !chains.is_empty() {
            saw_chain = true;
        }
        if !parts.is_empty() {
            saw_part = true;
        }
        if !rounds.is_empty() {
            saw_round = true;
        }
        if !signatures.is_empty() {
            saw_signature = true;
        }
        if !proposers.is_empty() {
            saw_proposer = true;
        }
        if !refused_votes.is_empty() {
            saw_refused = true;
        }
        if !reached && !unanswered.is_empty() {
            return Err(ChainError::P2p("timeout"));
        }
        if !reached && !refused.is_empty() {
            return Err(ChainError::P2p("dial-failure"));
        }
        if !reached && !closed.is_empty() {
            return Err(ChainError::P2p("connection-closed"));
        }
        if !reached && !stalled.is_empty() {
            return Err(ChainError::P2p("rr-timeout"));
        }
        if !reached && !unreadable.is_empty() {
            return Err(ChainError::P2p("io"));
        }
        if !reached && !foreign.is_empty() {
            return Err(ChainError::P2p("genesis"));
        }
        if !reached && !chains.is_empty() {
            return Err(ChainError::ChainId);
        }
        if !reached && !parts.is_empty() {
            return Err(ChainError::BadPartSet);
        }
        if !reached && !rounds.is_empty() {
            return Err(ChainError::RoundRegression);
        }
        if !reached && !signatures.is_empty() {
            return Err(ChainError::BadProposerSignature);
        }
        if !reached && !proposers.is_empty() {
            return Err(ChainError::NotProposer);
        }
        if !reached && !refused_votes.is_empty() {
            return Err(ChainError::P2p("vote"));
        }
        if !reached && !silent.is_empty() {
            return Err(ChainError::P2p("unsupported-protocol"));
        }
        if !reached && !outsiders.is_empty() {
            return Err(ChainError::P2p("peer"));
        }
        let now = node.committed_height()?;
        if now >= height {
            height = now.checked_add(1).ok_or(ChainError::Overflow)?;
        } else {
            height = height.checked_add(1).ok_or(ChainError::Overflow)?;
        }
    }
}

/// One validator the operator named. This is not a discovered peer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfiguredPeer {
    pub addr: Multiaddr,
    pub peer_id: PeerId,
}

async fn deliver_configured(
    node: &ArkheNode,
    peer: &ConfiguredPeer,
    vote: &crate::Precommit,
    unanswered: &mut Vec<ConfiguredPeer>,
    refused: &mut Vec<ConfiguredPeer>,
    closed: &mut Vec<ConfiguredPeer>,
    stalled: &mut Vec<ConfiguredPeer>,
    unreadable: &mut Vec<ConfiguredPeer>,
    foreign: &mut Vec<ConfiguredPeer>,
    chains: &mut Vec<ConfiguredPeer>,
    parts: &mut Vec<ConfiguredPeer>,
    rounds: &mut Vec<ConfiguredPeer>,
    signatures: &mut Vec<ConfiguredPeer>,
    proposers: &mut Vec<ConfiguredPeer>,
    refused_votes: &mut Vec<ConfiguredPeer>,
    silent: &mut Vec<ConfiguredPeer>,
    outsiders: &mut Vec<ConfiguredPeer>,
    reached: &mut bool,
) -> Result<(), ChainError> {
    if unanswered.iter().any(|item| item == peer)
        || refused.iter().any(|item| item == peer)
        || closed.iter().any(|item| item == peer)
        || stalled.iter().any(|item| item == peer)
        || unreadable.iter().any(|item| item == peer)
        || foreign.iter().any(|item| item == peer)
        || chains.iter().any(|item| item == peer)
        || parts.iter().any(|item| item == peer)
        || rounds.iter().any(|item| item == peer)
        || signatures.iter().any(|item| item == peer)
        || proposers.iter().any(|item| item == peer)
        || refused_votes.iter().any(|item| item == peer)
        || silent.iter().any(|item| item == peer)
        || outsiders.iter().any(|item| item == peer)
    {
        return Ok(());
    }
    match submit_precommit(node, peer.addr.clone(), peer.peer_id, vote).await {
        Ok(_) => {
            *reached = true;
            Ok(())
        }
        Err(ChainError::P2p("self"))
        | Err(ChainError::UnknownBlock)
        | Err(ChainError::Fork) => Ok(()),
        Err(ChainError::P2p("timeout")) => {
            unanswered.push(peer.clone());
            Ok(())
        }
        Err(ChainError::P2p("dial-failure")) => {
            refused.push(peer.clone());
            Ok(())
        }
        Err(ChainError::P2p("connection-closed")) => {
            closed.push(peer.clone());
            Ok(())
        }
        Err(ChainError::P2p("rr-timeout")) => {
            stalled.push(peer.clone());
            Ok(())
        }
        Err(ChainError::P2p("io")) => {
            unreadable.push(peer.clone());
            Ok(())
        }
        Err(ChainError::P2p("genesis")) => {
            foreign.push(peer.clone());
            Ok(())
        }
        Err(ChainError::ChainId) => {
            chains.push(peer.clone());
            Ok(())
        }
        Err(ChainError::BadPartSet) => {
            parts.push(peer.clone());
            Ok(())
        }
        Err(ChainError::RoundRegression) => {
            rounds.push(peer.clone());
            Ok(())
        }
        Err(ChainError::BadProposerSignature) => {
            signatures.push(peer.clone());
            Ok(())
        }
        Err(ChainError::NotProposer) => {
            proposers.push(peer.clone());
            Ok(())
        }
        Err(ChainError::P2p("vote")) => {
            refused_votes.push(peer.clone());
            Ok(())
        }
        Err(ChainError::P2p("unsupported-protocol")) => {
            silent.push(peer.clone());
            Ok(())
        }
        Err(ChainError::P2p("peer")) => {
            outsiders.push(peer.clone());
            Ok(())
        }
        Err(error) => Err(error),
    }
}

/// Dial `peers` in order. An empty list is `P2p("empty")`. The node's own id
/// is skipped. A peer that returns 0 is caught up, behind, or a stored sibling.
/// A peer that imports blocks does not end the list. A `P2p("fork")` that
/// stored nothing does not end the list either. The result is the sum of the
/// imported blocks. A peer that does not answer within 30 seconds does not end the list either.
/// A peer whose genesis differs does not end the list either. If nothing was
/// imported and a peer timed out, the result is `P2p("timeout")`. If nothing
/// was imported and a genesis differed, the result is `P2p("genesis")`. If
/// every answered peer is that fork and nothing was imported, timed out, or
/// rejected for genesis, the result is `P2p("fork")`. A peer that stops at
/// 128 headers does not end the list. If nothing was imported and that was
/// the sharpest result, the result is `P2p("sync-limit")` and the cursor
/// stays. A named peer that does not speak the sync protocol does not end
/// the list. If nothing was imported and that was the sharpest result, the
/// result is `P2p("unsupported-protocol")`. A body whose hash does not match
/// does not end the list. If nothing was imported and that was the sharpest
/// result, the result is `P2p("hash")` and nothing is stored. An announced
/// tip that is not 32 bytes does not end the list. Alone, that result stays
/// `P2p("tip")` and nothing is stored. A peer id that is not a validator
/// does not end the list. Alone, that result stays `P2p("peer")` and nothing
/// is stored. A dial the peer refuses does not end the list and does not
/// wait 30 seconds. Alone, that result stays `P2p("dial-failure")` and
/// nothing is stored. The 30 second limit remains when a dial yields no
/// error. A connection that closes during the request does not end the
/// list. Alone, that result stays `P2p("connection-closed")` and nothing
/// is stored. A body that does not decode does not end the list. Alone, that
/// result stays `Malformed` and nothing is stored. A request that is not
/// answered within 10 seconds does not end the list. Alone, that result
/// stays `P2p("rr-timeout")` and nothing is stored. A response the codec
/// cannot read does not end the list. Alone, that result stays `P2p("io")`
/// and nothing is stored. A body whose proposer signature does not verify
/// does not end the list. Alone, that result stays `BadProposerSignature`
/// and nothing is stored. A body whose proposer is not a validator does not
/// end the list. Alone, that result stays `NotProposer` and nothing
/// is stored. A body whose height does not follow its parent does not end
/// the list. Alone, that result stays `ParentMismatch` and nothing is stored.
/// A body whose state root or MMR count does not match the replay does not
/// end the list. Alone, that result stays `StateMismatch` and nothing is
/// stored. A body whose timestamp is zero
/// does not end the list. Alone, that result stays `BadTimestamp` and nothing
/// is stored. A body whose sender signature does not verify does not end
/// the list. Alone, that result stays `UnverifiedSignature` and nothing is
/// stored. A body whose transaction nonce is not the next one does not end
/// the list. Both sender signatures still verify. Alone, that result stays
/// `BadNonce` and nothing is stored. A body that transfers to its own sender
/// does not end the list. The nonce is the next one and both sender
/// signatures still verify. Alone, that result stays `SelfTransfer` and
/// nothing is stored. A body that spends more than the sender holds does not
/// end the list. The recipient is someone else, the nonce is the next one,
/// and both sender signatures still verify. Alone, that result stays
/// `InsufficientBalance` and nothing is stored. A body whose verdict is not
/// Allow does not end the list. Both sender signatures still verify. Alone,
/// that result stays `Admission("not-allow")` and nothing is stored. A body
/// whose Allow verdict names another subject does not end the list. A decoded
/// verdict re-encodes to the same bytes, so that check is not this one. Both
/// sender signatures still verify. Alone, that result stays
/// `Admission("subject")` and nothing is stored. A body whose payload does
/// not decode as a verdict does not end the list. Both sender signatures
/// still verify. Alone, that result stays `Admission("verdict")` and nothing
/// is stored. A body whose payload is longer than 4096 bytes does not decode.
/// Alone, that result stays `Malformed` and nothing is stored. A loose
/// transfer with that payload stays `Admission("payload")` at ingest and does
/// not enter a block. The re-encode check does not fire. A body whose
/// ML-DSA signature is neither empty nor 3309 bytes does not decode. Alone,
/// that result stays `BadSignatureLength` and nothing is stored. An empty
/// field stays `UnverifiedSignature`. A longer field stays `Malformed`.
/// A body whose account contains a character outside the allowed set does
/// not decode. Alone, that result stays `BadAccount` and nothing is stored.
/// An empty name, or one longer than 128 bytes, stays `Malformed`.
/// A body whose attestation version is not 1, or whose scheme is not 1, does
/// not end the list. Alone, that result stays `Attest("version")` and nothing
/// is stored. A body whose attestation names another chain, genesis, or
/// audience does not end the list. The version and the scheme stay 1. Alone,
/// that result stays `Attest("domain")` and nothing is stored. A body whose
/// attestation window does not cover the block height does not end the list.
/// The version, the scheme, the chain, the genesis, and the audience match.
/// Alone, that result stays `Attest("window")` and nothing is stored. A
/// window whose start is after its end returns the same error. A body that
/// admits the same signer nonce twice does not end the list. The version,
/// the scheme, the chain, the genesis, the audience, and the window match,
/// and the signature verifies. Alone, that result stays `Attest("replay")`
/// and nothing is stored. A body that revokes a role the registry never
/// granted does not end the list. The signer is `genesis-alloc`, the
/// signature verifies, and the version, the scheme, the chain, the genesis,
/// the audience, and the window match. Alone, that result stays
/// `Attest("authority")` and nothing is stored. A grant given by someone
/// else returns the same error. A body that executes an approval the
/// registry does not contain does not end the list. The approval, the
/// action, and the artifact are 32 zero bytes. Alone, that result stays
/// `Attest("unknown")` and nothing is stored. A body that admits a request
/// and then executes that id does not end the list. The request is not an
/// approval. Alone, that result stays `Attest("kind")` and nothing is stored.
/// A body that executes an approval whose policy digest is 32 zero bytes does
/// not end the list. The same grant is part of the genesis: `genesis-alloc`
/// may approve through height 10. The signer holds that role, and the version,
/// the scheme, the chain, the genesis, the audience, and the window match.
/// Alone, that result stays `Attest("policy")` and nothing is stored. The
/// action and the artifact are not checked. A body that executes a different
/// action does not end the list. The policy digest matches the registry. The
/// approved action is 32 bytes of 1 and the executed action is 32 zero bytes.
/// The artifact is 32 zero bytes on both and is not checked. Alone, that
/// result stays `Attest("action")` and nothing is stored. A body that executes
/// a different artifact does not end the list. The policy digest and the
/// action match. The approved artifact is 32 bytes of 1 and the executed
/// artifact is 32 zero bytes. The evaluation is not checked. Alone, that
/// result stays `Attest("artifact")` and nothing is stored. A body that
/// executes an approval whose evaluation is 32 zero bytes does not end the
/// list. The policy digest, the action, and the artifact match. The
/// evaluation is not in the registry. Alone, that result stays
/// `Attest("link")` and nothing is stored. An evaluation that is not an
/// Evaluation claim, or whose artifact differs, returns the same error. A
/// body that executes an approval whose evaluation is present and failed
/// does not end the list. The policy digest, the action, and the artifact
/// match. Alone, that result stays `Attest("evaluation")` and nothing is
/// stored. The evaluation window and the evaluator role are not checked. A
/// body that uses the same signer for the evaluation and the approval does
/// not end the list. The evaluation passed. The same grants are part of the
/// genesis: `genesis-alloc` may approve and evaluate through height 10. Alone,
/// that result stays `Attest("separation")` and nothing is stored. An author
/// who is also the approver or the evaluator returns the same error. A body
/// that executes the same approval twice does not end the list. The first
/// execution would succeed: distinct requester, author, evaluator, and
/// approver, with matching grants in the genesis. Alone, that result stays
/// `Attest("consumed")` and nothing is stored. A body that admits one more
/// attestation from a signer who already holds 64 does not end the list.
/// The local tip already carries those 64. Alone, that result stays
/// `Attest("quota")` and the tip does not move. A body that admits one more
/// attestation when the registry already holds 4096 leaves does not end the
/// list. The local tip already carries those 4096. Alone, that result stays
/// `Attest("full")` and the tip does not move. Any other attestation error still stops the list.
/// Equivocation still stops the list. Any other error
/// stops the rest of the list. There is no
/// discovery and no retry of a refused validator.
pub async fn sync_configured(
    node: &ArkheNode,
    peers: &[ConfiguredPeer],
) -> Result<u64, ChainError> {
    sync_pass(node, peers).await.map(|pass| pass.imported)
}

pub(crate) struct SyncPass {
    pub imported: u64,
    /// True when a named peer was not reached. An answered import still
    /// counts. A fork or a bad body is a peer that answered, not a missed
    /// peer. A different genesis is also answered, and the operator still
    /// fails the pass.
    pub missed: bool,
    /// True when a named peer announced a canonical ancestor of the local
    /// tip. The local tip itself is not behind. A sibling stored as `Fork`
    /// is not behind.
    pub behind: bool,
    /// True when a named peer answered with a different genesis. The import
    /// count can still be nonzero. The operator fails the pass and does not
    /// seal.
    pub foreign_genesis: bool,
    /// True when a named peer returned a body whose hash is not the one
    /// requested. The import count can still be nonzero. The operator fails
    /// the pass and does not seal.
    pub bad_hash: bool,
    /// True when a named peer returned a body that does not decode. The
    /// import count can still be nonzero. The operator fails the pass and
    /// does not seal.
    pub malformed: bool,
    /// True when a named peer announced a tip that is not 32 bytes. The
    /// import count can still be nonzero. The operator fails the pass and
    /// does not seal.
    pub short_tip: bool,
    /// True when a named peer returned `P2p("fork")` and stored nothing.
    /// A sibling that was stored is `Heard::Count(0)` and is not this flag.
    /// The import count can still be nonzero. The operator fails the pass
    /// and does not seal.
    pub unstored_fork: bool,
    /// True when a named peer is not a validator. The check happens before
    /// the dial. The import count can still be nonzero. The operator fails
    /// the pass and does not seal.
    pub outsider: bool,
    /// True when a named peer returned a body whose proposer signature does
    /// not verify. The import count can still be nonzero. The operator fails
    /// the pass and does not seal.
    pub bad_proposer: bool,
    /// True when a named peer returned a body whose proposer is not a
    /// validator. The import count can still be nonzero. The operator fails
    /// the pass and does not seal.
    pub unknown_proposer: bool,
    /// True when a named peer returned a body whose height does not follow
    /// its parent. The import count can still be nonzero. The operator fails
    /// the pass and does not seal.
    pub parent_mismatch: bool,
    /// True when a named peer returned a body whose state root or MMR count
    /// does not match the replay. The import count can still be nonzero. The
    /// operator fails the pass and does not seal.
    pub state_mismatch: bool,
    /// True when a named peer returned a body whose timestamp is zero. The
    /// import count can still be nonzero. The operator fails the pass and
    /// does not seal.
    pub bad_timestamp: bool,
    /// True when a named peer returned a body whose sender signature does
    /// not verify. The proposer signature still verifies. The import count
    /// can still be nonzero. The operator fails the pass and does not seal.
    pub unverified_sender: bool,
    /// True when a named peer returned a body whose transaction nonce is not
    /// the next one. Both sender signatures still verify. The import count
    /// can still be nonzero. The operator fails the pass and does not seal.
    pub bad_nonce: bool,
    /// True when a named peer returned a body that transfers to its own
    /// sender. The nonce is the next one and both sender signatures still
    /// verify. The import count can still be nonzero. The operator fails the
    /// pass and does not seal.
    pub self_transfer: bool,
    /// True when a named peer returned a body that spends more than the
    /// sender holds. The recipient is someone else. The nonce is the next
    /// one and both sender signatures still verify. The import count can
    /// still be nonzero. The operator fails the pass and does not seal.
    pub short_balance: bool,
    /// True when a named peer returned a body whose verdict is not Allow.
    /// Both sender signatures still verify. The import count can still be
    /// nonzero. The operator fails the pass and does not seal.
    pub not_allow: bool,
    /// True when a named peer returned an Allow verdict for another subject.
    /// A decoded verdict re-encodes to the same bytes. Both sender signatures
    /// still verify. The import count can still be nonzero. The operator
    /// fails the pass and does not seal.
    pub foreign_subject: bool,
    /// True when a named peer returned a payload that does not decode as a
    /// verdict. Both sender signatures still verify. The import count can
    /// still be nonzero. The operator fails the pass and does not seal.
    /// A payload longer than 4096 bytes does not decode, so that pass stays
    /// `Malformed`. A loose transfer with that payload stays
    /// `Admission("payload")` at ingest.
    pub bad_verdict: bool,
    /// True when a named peer returned a body whose ML-DSA signature is
    /// neither empty nor 3309 bytes. The body does not decode. The import
    /// count can still be nonzero. The operator fails the pass and does not
    /// seal. An empty field stays `UnverifiedSignature`. A longer field stays
    /// `Malformed`.
    pub bad_signature_length: bool,
    /// True when a named peer returned a body whose account contains a
    /// character outside the allowed set. The body does not decode. The
    /// import count can still be nonzero. The operator fails the pass and
    /// does not seal. An empty name, or one longer than 128 bytes, stays
    /// `Malformed`.
    pub bad_account: bool,
    /// True when a named peer returned a body whose attestation version is
    /// not 1, or whose scheme is not 1. The import count can still be
    /// nonzero. The operator fails the pass and does not seal.
    pub attest_version: bool,
    /// True when a named peer returned an attestation for another chain,
    /// genesis, or audience. The version and the scheme stay 1. The import
    /// count can still be nonzero. The operator fails the pass and does not
    /// seal. Any other attestation error still stops the list.
    pub attest_domain: bool,
    /// True when a named peer returned an attestation whose window does not
    /// cover the block height. The version, the scheme, the chain, the
    /// genesis, and the audience match. The import count can still be
    /// nonzero. The operator fails the pass and does not seal. A window
    /// whose start is after its end returns the same error. Any other
    /// attestation error still stops the list.
    pub attest_window: bool,
    /// True when a named peer returned a body that admits the same signer
    /// nonce twice. The version, the scheme, the chain, the genesis, the
    /// audience, and the window match, and the signature verifies. The
    /// import count can still be nonzero. The operator fails the pass and
    /// does not seal. Any other attestation error still stops the list.
    pub attest_replay: bool,
    /// True when a named peer returned a revocation of a role the registry
    /// never granted. The signer is `genesis-alloc`, the signature verifies,
    /// and the version, the scheme, the chain, the genesis, the audience,
    /// and the window match. The import count can still be nonzero. The
    /// operator fails the pass and does not seal. A grant given by someone
    /// else returns the same error. Any other attestation error still stops
    /// the list.
    pub attest_authority: bool,
    /// True when a named peer returned an execution of an approval the
    /// registry does not contain. The approval, the action, and the artifact
    /// are 32 zero bytes. The import count can still be nonzero. The operator
    /// fails the pass and does not seal. Any other attestation error still
    /// stops the list.
    pub attest_unknown: bool,
    /// True when a named peer returned an execution of an id that is a
    /// request, not an approval. The import count can still be nonzero. The
    /// operator fails the pass and does not seal. Nothing from that body is
    /// stored. Any other attestation error still stops the list.
    pub attest_kind: bool,
    /// True when a named peer returned an execution of an approval whose
    /// policy digest is 32 zero bytes. The same grant is part of the genesis:
    /// `genesis-alloc` may approve through height 10. The signer holds that
    /// role. The import count can still be nonzero. The operator fails the
    /// pass and does not seal. Nothing from that body is stored. The action
    /// and the artifact are not checked. Any other attestation error still
    /// stops the list.
    pub attest_policy: bool,
    /// True when a named peer returned an execution whose action differs from
    /// the approval. The policy digest matches the registry. The approved
    /// action is 32 bytes of 1 and the executed action is 32 zero bytes. The
    /// artifact is 32 zero bytes on both and is not checked. The same grant is
    /// part of the genesis. The import count can still be nonzero. The
    /// operator fails the pass and does not seal. Nothing from that body is
    /// stored. Any other attestation error still stops the list.
    pub attest_action: bool,
    /// True when a named peer returned an execution whose artifact differs
    /// from the approval. The policy digest and the action match. The
    /// approved artifact is 32 bytes of 1 and the executed artifact is 32
    /// zero bytes. The evaluation is not checked. The same grant is part of
    /// the genesis. The import count can still be nonzero. The operator fails
    /// the pass and does not seal. Nothing from that body is stored. Any
    /// other attestation error still stops the list.
    pub attest_artifact: bool,
    /// True when a named peer returned an execution whose evaluation is 32
    /// zero bytes and is not in the registry. The policy digest, the action,
    /// and the artifact match. An evaluation that is not an Evaluation claim,
    /// or whose artifact differs, returns the same error. The same grant is
    /// part of the genesis. The import count can still be nonzero. The
    /// operator fails the pass and does not seal. Nothing from that body is
    /// stored. Any other attestation error still stops the list.
    pub attest_link: bool,
    /// True when a named peer returned an execution whose evaluation is
    /// present and failed. The policy digest, the action, and the artifact
    /// match. The evaluation window and the evaluator role are not checked.
    /// The same grant is part of the genesis. The import count can still be
    /// nonzero. The operator fails the pass and does not seal. Nothing from
    /// that body is stored. Any other attestation error still stops the list.
    pub attest_evaluation: bool,
    /// True when a named peer returned an execution whose evaluation and
    /// approval share one signer. The evaluation passed. The same grants are
    /// part of the genesis: `genesis-alloc` may approve and evaluate through
    /// height 10. An author who is also the approver or the evaluator returns
    /// the same error. The import count can still be nonzero. The operator
    /// fails the pass and does not seal. Nothing from that body is stored.
    /// Any other attestation error still stops the list.
    pub attest_separation: bool,
    /// True when a named peer returned a body that executes the same approval
    /// twice. The first execution would succeed: distinct requester, author,
    /// evaluator, and approver, with matching grants in the genesis. The
    /// import count can still be nonzero. The operator fails the pass and
    /// does not seal. Nothing from that body is stored. Any other attestation
    /// error still stops the list.
    pub attest_consumed: bool,
    /// True when a named peer returned a body that admits one more attestation
    /// from a signer who already holds 64. The local tip already carries those
    /// 64. The import count can still be nonzero. The operator fails the pass
    /// and does not seal. The tip does not move. Any other attestation error
    /// still stops the list.
    pub attest_quota: bool,
    /// True when a named peer returned a body that admits one more attestation
    /// when the registry already holds 4096 leaves. The local tip already
    /// carries those 4096. The import count can still be nonzero. The operator
    /// fails the pass and does not seal. The tip does not move. Any other
    /// attestation error still stops the list.
    pub attest_full: bool,
}

pub(crate) async fn sync_pass(
    node: &ArkheNode,
    peers: &[ConfiguredPeer],
) -> Result<SyncPass, ChainError> {
    if peers.is_empty() {
        return Err(ChainError::P2p("empty"));
    }
    let mut saw_self = false;
    let mut saw_peer = false;
    let mut saw_fork = false;
    let mut saw_timeout = false;
    let mut saw_dial = false;
    let mut saw_closed = false;
    let mut saw_rr = false;
    let mut saw_io = false;
    let mut saw_genesis = false;
    let mut saw_limit = false;
    let mut saw_silent = false;
    let mut saw_hash = false;
    let mut saw_malformed = false;
    let mut saw_tip = false;
    let mut saw_outsider = false;
    let mut saw_bad_proposer = false;
    let mut saw_unknown_proposer = false;
    let mut saw_parent = false;
    let mut saw_state = false;
    let mut saw_time = false;
    let mut saw_sender = false;
    let mut saw_nonce = false;
    let mut saw_self_transfer = false;
    let mut saw_balance = false;
    let mut saw_allow = false;
    let mut saw_subject = false;
    let mut saw_verdict = false;
    let mut saw_length = false;
    let mut saw_account = false;
    let mut saw_attest_version = false;
    let mut saw_attest_domain = false;
    let mut saw_attest_window = false;
    let mut saw_attest_replay = false;
    let mut saw_attest_authority = false;
    let mut saw_attest_unknown = false;
    let mut saw_attest_kind = false;
    let mut saw_attest_policy = false;
    let mut saw_attest_action = false;
    let mut saw_attest_artifact = false;
    let mut saw_attest_link = false;
    let mut saw_attest_evaluation = false;
    let mut saw_attest_separation = false;
    let mut saw_attest_consumed = false;
    let mut saw_attest_quota = false;
    let mut saw_attest_full = false;
    let mut saw_behind = false;
    let mut imported_total = 0u64;
    for peer in peers {
        match sync_one(node, peer.addr.clone(), peer.peer_id).await {
            Ok(Heard::Count(imported)) => {
                saw_peer = true;
                imported_total = imported_total
                    .checked_add(imported)
                    .ok_or(ChainError::Overflow)?;
            }
            Ok(Heard::Behind) => {
                saw_peer = true;
                saw_behind = true;
            }
            Err(ChainError::P2p("self")) => saw_self = true,
            Err(ChainError::P2p("fork")) => saw_fork = true,
            Err(ChainError::P2p("timeout")) => saw_timeout = true,
            Err(ChainError::P2p("dial-failure")) => saw_dial = true,
            Err(ChainError::P2p("connection-closed")) => saw_closed = true,
            Err(ChainError::P2p("rr-timeout")) => saw_rr = true,
            Err(ChainError::P2p("io")) => saw_io = true,
            Err(ChainError::P2p("genesis")) => saw_genesis = true,
            Err(ChainError::P2p("sync-limit")) => saw_limit = true,
            Err(ChainError::P2p("unsupported-protocol")) => saw_silent = true,
            Err(ChainError::P2p("hash")) => saw_hash = true,
            Err(ChainError::Malformed) => saw_malformed = true,
            Err(ChainError::P2p("tip")) => saw_tip = true,
            Err(ChainError::P2p("peer")) => saw_outsider = true,
            Err(ChainError::BadProposerSignature) => saw_bad_proposer = true,
            Err(ChainError::NotProposer) => saw_unknown_proposer = true,
            Err(ChainError::ParentMismatch) => saw_parent = true,
            Err(ChainError::StateMismatch) => saw_state = true,
            Err(ChainError::BadTimestamp) => saw_time = true,
            Err(ChainError::UnverifiedSignature) => saw_sender = true,
            Err(ChainError::BadNonce) => saw_nonce = true,
            Err(ChainError::SelfTransfer) => saw_self_transfer = true,
            Err(ChainError::InsufficientBalance) => saw_balance = true,
            Err(ChainError::Admission("not-allow")) => saw_allow = true,
            Err(ChainError::Admission("subject")) => saw_subject = true,
            Err(ChainError::Admission("verdict")) => saw_verdict = true,
            Err(ChainError::BadSignatureLength) => saw_length = true,
            Err(ChainError::BadAccount) => saw_account = true,
            Err(ChainError::Attest("version")) => saw_attest_version = true,
            Err(ChainError::Attest("domain")) => saw_attest_domain = true,
            Err(ChainError::Attest("window")) => saw_attest_window = true,
            Err(ChainError::Attest("replay")) => saw_attest_replay = true,
            Err(ChainError::Attest("authority")) => saw_attest_authority = true,
            Err(ChainError::Attest("unknown")) => saw_attest_unknown = true,
            Err(ChainError::Attest("kind")) => saw_attest_kind = true,
            Err(ChainError::Attest("policy")) => saw_attest_policy = true,
            Err(ChainError::Attest("action")) => saw_attest_action = true,
            Err(ChainError::Attest("artifact")) => saw_attest_artifact = true,
            Err(ChainError::Attest("link")) => saw_attest_link = true,
            Err(ChainError::Attest("evaluation")) => saw_attest_evaluation = true,
            Err(ChainError::Attest("separation")) => saw_attest_separation = true,
            Err(ChainError::Attest("consumed")) => saw_attest_consumed = true,
            Err(ChainError::Attest("quota")) => saw_attest_quota = true,
            Err(ChainError::Attest("full")) => saw_attest_full = true,
            Err(error) => return Err(error),
        }
    }
    let missed = saw_timeout || saw_dial || saw_closed || saw_rr || saw_io || saw_limit || saw_silent;
    if saw_peer {
        Ok(SyncPass {
            imported: imported_total,
            missed,
            behind: saw_behind,
            foreign_genesis: saw_genesis,
            bad_hash: saw_hash,
            malformed: saw_malformed,
            short_tip: saw_tip,
            unstored_fork: saw_fork,
            outsider: saw_outsider,
            bad_proposer: saw_bad_proposer,
            unknown_proposer: saw_unknown_proposer,
            parent_mismatch: saw_parent,
            state_mismatch: saw_state,
            bad_timestamp: saw_time,
            unverified_sender: saw_sender,
            bad_nonce: saw_nonce,
            self_transfer: saw_self_transfer,
            short_balance: saw_balance,
            not_allow: saw_allow,
            foreign_subject: saw_subject,
            bad_verdict: saw_verdict,
            bad_signature_length: saw_length,
            bad_account: saw_account,
            attest_version: saw_attest_version,
            attest_domain: saw_attest_domain,
            attest_window: saw_attest_window,
            attest_replay: saw_attest_replay,
            attest_authority: saw_attest_authority,
            attest_unknown: saw_attest_unknown,
            attest_kind: saw_attest_kind,
            attest_policy: saw_attest_policy,
            attest_action: saw_attest_action,
            attest_artifact: saw_attest_artifact,
            attest_link: saw_attest_link,
            attest_evaluation: saw_attest_evaluation,
            attest_separation: saw_attest_separation,
            attest_consumed: saw_attest_consumed,
            attest_quota: saw_attest_quota,
            attest_full: saw_attest_full,
        })
    } else if saw_timeout {
        Err(ChainError::P2p("timeout"))
    } else if saw_dial {
        Err(ChainError::P2p("dial-failure"))
    } else if saw_closed {
        Err(ChainError::P2p("connection-closed"))
    } else if saw_rr {
        Err(ChainError::P2p("rr-timeout"))
    } else if saw_io {
        Err(ChainError::P2p("io"))
    } else if saw_genesis {
        Err(ChainError::P2p("genesis"))
    } else if saw_limit {
        Err(ChainError::P2p("sync-limit"))
    } else if saw_silent {
        Err(ChainError::P2p("unsupported-protocol"))
    } else if saw_hash {
        Err(ChainError::P2p("hash"))
    } else if saw_malformed {
        Err(ChainError::Malformed)
    } else if saw_tip {
        Err(ChainError::P2p("tip"))
    } else if saw_fork {
        Err(ChainError::P2p("fork"))
    } else if saw_outsider {
        Err(ChainError::P2p("peer"))
    } else if saw_bad_proposer {
        Err(ChainError::BadProposerSignature)
    } else if saw_unknown_proposer {
        Err(ChainError::NotProposer)
    } else if saw_parent {
        Err(ChainError::ParentMismatch)
    } else if saw_state {
        Err(ChainError::StateMismatch)
    } else if saw_time {
        Err(ChainError::BadTimestamp)
    } else if saw_sender {
        Err(ChainError::UnverifiedSignature)
    } else if saw_nonce {
        Err(ChainError::BadNonce)
    } else if saw_self_transfer {
        Err(ChainError::SelfTransfer)
    } else if saw_balance {
        Err(ChainError::InsufficientBalance)
    } else if saw_allow {
        Err(ChainError::Admission("not-allow"))
    } else if saw_subject {
        Err(ChainError::Admission("subject"))
    } else if saw_verdict {
        Err(ChainError::Admission("verdict"))
    } else if saw_length {
        Err(ChainError::BadSignatureLength)
    } else if saw_account {
        Err(ChainError::BadAccount)
    } else if saw_attest_version {
        Err(ChainError::Attest("version"))
    } else if saw_attest_domain {
        Err(ChainError::Attest("domain"))
    } else if saw_attest_window {
        Err(ChainError::Attest("window"))
    } else if saw_attest_replay {
        Err(ChainError::Attest("replay"))
    } else if saw_attest_authority {
        Err(ChainError::Attest("authority"))
    } else if saw_attest_unknown {
        Err(ChainError::Attest("unknown"))
    } else if saw_attest_kind {
        Err(ChainError::Attest("kind"))
    } else if saw_attest_policy {
        Err(ChainError::Attest("policy"))
    } else if saw_attest_action {
        Err(ChainError::Attest("action"))
    } else if saw_attest_artifact {
        Err(ChainError::Attest("artifact"))
    } else if saw_attest_link {
        Err(ChainError::Attest("link"))
    } else if saw_attest_evaluation {
        Err(ChainError::Attest("evaluation"))
    } else if saw_attest_separation {
        Err(ChainError::Attest("separation"))
    } else if saw_attest_consumed {
        Err(ChainError::Attest("consumed"))
    } else if saw_attest_quota {
        Err(ChainError::Attest("quota"))
    } else if saw_attest_full {
        Err(ChainError::Attest("full"))
    } else if saw_self {
        Err(ChainError::P2p("self"))
    } else {
        Err(ChainError::P2p("empty"))
    }
}

/// Send one local precommit to a configured validator. The receiver runs
/// `note_precommit` and then `bft_commit` for that height. When the vote is
/// stored, the reply carries the receiver's own v4 precommit, if it has one.
/// The sender stores its own vote before dialing when that vote verifies,
/// stores the returned vote, and tries the same height. The request carries
/// the voted block when that body leaves 4096 bytes for the vote envelope
/// inside the 1 MiB request. A larger body is left out. The vote is still
/// sent. The receiver imports an attached body only when it extends the
/// receiver's tip by one height and the body hash is the vote hash. A sibling is stored as `Fork` and does not replace the
/// tip. A body that skips a height is ignored and stores nothing.
/// A refused vote carries no echo. The returned height is the sender's
/// committed height. The tip hash does not change. This is not a
/// `CanonicalVote`. There is no discovery.
pub async fn submit_precommit(
    node: &ArkheNode,
    addr: Multiaddr,
    peer: PeerId,
    vote: &crate::Precommit,
) -> Result<u64, ChainError> {
    if peer == node.peer_id() {
        return Err(ChainError::P2p("self"));
    }
    if !node.accepts_peer(&peer) {
        return Err(ChainError::P2p("peer"));
    }
    if node.note_precommit(vote).is_ok() {
        let _ = node.bft_commit(vote.height);
    }
    let block = vote_body_for_request(node.encoded_block(&vote.block_hash)?);
    let request = vote_request(vote, node.genesis_hash(), block);
    let key = node.network_keypair();
    let mut swarm = build(key)?;
    let dial = addr.with(libp2p::multiaddr::Protocol::P2p(peer));
    swarm.dial(dial).map_err(|_| ChainError::P2p("dial"))?;
    match tokio::time::timeout(Duration::from_secs(30), deliver(&mut swarm, node, peer, request)).await {
        Ok(result) => result,
        Err(_) => Err(ChainError::P2p("timeout")),
    }
}

fn vote_body_for_request(body: Option<Vec<u8>>) -> Option<Vec<u8>> {
    match body {
        Some(body) if body.len() <= VOTE_BLOCK_LIMIT => Some(body),
        _ => None,
    }
}

fn vote_request(
    vote: &crate::Precommit,
    genesis: [u8; 32],
    block: Option<Vec<u8>>,
) -> VoteRequest {
    VoteRequest {
        validator_id: vote.validator_id.clone(),
        height: vote.height,
        round: vote.round,
        block_hash: vote.block_hash,
        parts: vote.parts,
        part_hash: vote.part_hash,
        chain_id: vote.chain_id.clone(),
        signature: vote.signature.to_vec(),
        genesis,
        block,
    }
}

async fn deliver(
    swarm: &mut Swarm<Behaviour>,
    node: &ArkheNode,
    peer: PeerId,
    request: VoteRequest,
) -> Result<u64, ChainError> {
    let mut request_id = None;
    let mut request = Some(request);
    loop {
        match swarm.select_next_some().await {
            libp2p::swarm::SwarmEvent::ConnectionEstablished { peer_id, .. }
                if peer_id == peer && request_id.is_none() =>
            {
                request_id = Some(
                    swarm
                        .behaviour_mut()
                        .vote
                        .send_request(&peer, request.take().expect("vote request")),
                );
            }
            libp2p::swarm::SwarmEvent::OutgoingConnectionError { peer_id, .. }
                if peer_id == Some(peer) =>
            {
                return Err(ChainError::P2p("dial-failure"));
            }
            libp2p::swarm::SwarmEvent::Behaviour(NodeBehaviourEvent::Vote(
                request_response::Event::Message {
                    peer: responder,
                    message:
                        request_response::Message::Response {
                            request_id: response_id,
                            response,
                        },
                    ..
                },
            )) if responder == peer && Some(response_id) == request_id => {
                return apply_echo(node, response);
            }
            libp2p::swarm::SwarmEvent::Behaviour(NodeBehaviourEvent::Vote(
                request_response::Event::OutboundFailure {
                    peer: responder,
                    error,
                    ..
                },
            )) if responder == peer => {
                return Err(ChainError::P2p(outbound_reason(error)));
            }
            _ => {}
        }
    }
}

fn apply_echo(node: &ArkheNode, reply: VoteReply) -> Result<u64, ChainError> {
    if !(reply.stored && reply.reason.is_none()) {
        return Err(match reply.reason.as_deref() {
        Some("signature") => ChainError::BadProposerSignature,
        Some("unknown") => ChainError::UnknownBlock,
        Some("fork") => ChainError::Fork,
        Some("equivocation") => ChainError::Equivocation,
        Some("round") => ChainError::RoundRegression,
        Some("part") => ChainError::BadPartSet,
        Some("chain-id") => ChainError::ChainId,
        Some("genesis") => ChainError::P2p("genesis"),
        Some("proposer") => ChainError::NotProposer,
        _ => ChainError::P2p("vote"),
        });
    }
    if let Some(echo) = reply.echo {
        let vote = precommit_from_request(echo)?;
        node.note_precommit(&vote)?;
        let _ = node.bft_commit(vote.height);
    }
    node.committed_height()
}

fn precommit_from_request(request: VoteRequest) -> Result<crate::Precommit, ChainError> {
    let Ok(signature) = <[u8; 64]>::try_from(request.signature) else {
        return Err(ChainError::BadProposerSignature);
    };
    Ok(crate::Precommit {
        validator_id: request.validator_id,
        height: request.height,
        round: request.round,
        block_hash: request.block_hash,
        parts: request.parts,
        part_hash: request.part_hash,
        chain_id: request.chain_id,
        signature,
    })
}

/// Import one block of a sync walk. The walk read the local tip before it
/// asked for this block. A vote that carries the same block can import it in
/// between, and then the import here answers `ParentMismatch`. A block that
/// is already canonical on this node is not a failed walk.
pub fn import_synced(node: &ArkheNode, body: &[u8]) -> Result<(), ChainError> {
    match node.import_block(body) {
        Ok(_) => Ok(()),
        Err(ChainError::ParentMismatch)
            if announced_is_canonical(node, crate::tx::block_hash(body))? =>
        {
            Ok(())
        }
        Err(error) => Err(error),
    }
}

fn vote_can_import(node: &ArkheNode, vote: &crate::Precommit) -> bool {
    if vote.parts != 1 || vote.part_hash != vote.block_hash || vote.chain_id != crate::CHAIN_ID {
        return false;
    }
    let Some(public) = node.validators.get(&vote.validator_id) else {
        return false;
    };
    let message = crate::precommit_message(
        vote.height,
        vote.round,
        &vote.block_hash,
        vote.parts,
        &vote.part_hash,
        &vote.chain_id,
    );
    public.verify(&message, &vote.signature)
}

fn import_voted_block(
    node: &ArkheNode,
    block_hash: [u8; 32],
    body: Option<&[u8]>,
) -> Result<(), ChainError> {
    let Some(body) = body else {
        return Ok(());
    };
    if body.len() > VOTE_REQUEST_LIMIT || crate::tx::block_hash(body) != block_hash {
        return Ok(());
    }
    if crate::decode_block(body).is_err() {
        return Ok(());
    }
    match node.import_block(body) {
        Ok(_) | Err(ChainError::Fork) => Ok(()),
        Err(ChainError::Equivocation) => Err(ChainError::Equivocation),
        Err(_) => Ok(()),
    }
}

fn answer_vote(node: &ArkheNode, request: VoteRequest) -> VoteReply {
    let committed = node.committed_height().unwrap_or(0);
    if request.genesis != node.genesis_hash() {
        return VoteReply {
            stored: false,
            reason: Some("genesis".to_string()),
            committed,
            echo: None,
        };
    }
    let body = request.block;
    let Ok(signature) = <[u8; 64]>::try_from(request.signature) else {
        return VoteReply {
            stored: false,
            reason: Some("signature".to_string()),
            committed,
            echo: None,
        };
    };
    let vote = crate::Precommit {
        validator_id: request.validator_id,
        height: request.height,
        round: request.round,
        block_hash: request.block_hash,
        parts: request.parts,
        part_hash: request.part_hash,
        chain_id: request.chain_id,
        signature,
    };
    if vote_can_import(&node, &vote) {
        if let Err(error) = import_voted_block(&node, vote.block_hash, body.as_deref()) {
            return VoteReply {
                stored: false,
                reason: Some(vote_reason(&error).to_string()),
                committed,
                echo: None,
            };
        }
    }
    match node.note_precommit(&vote) {
        Err(error) => VoteReply {
            stored: false,
            reason: Some(vote_reason(&error).to_string()),
            committed,
            echo: None,
        },
        Ok(()) => {
            let _ = node.bft_commit(vote.height);
            let _ = node.attest_own_next();
            let echo = node
                .own_precommit(vote.height)
                .ok()
                .flatten()
                .map(|stored| vote_request(&stored, node.genesis_hash(), None));
            VoteReply {
                stored: true,
                reason: None,
                committed: node.committed_height().unwrap_or(committed),
                echo,
            }
        }
    }
}

fn vote_reason(error: &ChainError) -> &'static str {
    match error {
        ChainError::BadProposerSignature => "signature",
        ChainError::UnknownBlock => "unknown",
        ChainError::Fork => "fork",
        ChainError::Equivocation => "equivocation",
        ChainError::RoundRegression => "round",
        ChainError::BadPartSet => "part",
        ChainError::ChainId => "chain-id",
        ChainError::NotProposer => "proposer",
        _ => "refused",
    }
}

/// Send one signed transaction to a named validator. The receiver ingests it
/// and does not change the tip. The reply does not dial. When that process
/// was started with `--seal` and no named peers, it seals one block before
/// answering. With named peers the transaction stays in the mempool until a
/// later pass has heard one of them. The first block uses the process
/// timestamp. Each later block uses the parent timestamp plus one. That pass
/// then attests round 0. A refused transaction is not stored. This does not
/// discover peers and does not choose a proposer.
pub async fn submit_tx(
    node: &ArkheNode,
    addr: Multiaddr,
    peer: PeerId,
    tx: &crate::Transaction,
) -> Result<(), ChainError> {
    if peer == node.peer_id() {
        return Err(ChainError::P2p("self"));
    }
    if !node.accepts_peer(&peer) {
        return Err(ChainError::P2p("peer"));
    }
    let body = crate::codec::encode_tx(tx);
    if body.len() > TX_BODY_LIMIT {
        return Err(ChainError::Malformed);
    }
    let key = node.network_keypair();
    let mut swarm = build(key)?;
    let dial = addr.with(libp2p::multiaddr::Protocol::P2p(peer));
    swarm.dial(dial).map_err(|_| ChainError::P2p("dial"))?;
    match tokio::time::timeout(
        Duration::from_secs(30),
        deliver_tx(&mut swarm, peer, node.genesis_hash(), body),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => Err(ChainError::P2p("timeout")),
    }
}

async fn deliver_tx(
    swarm: &mut Swarm<Behaviour>,
    peer: PeerId,
    genesis: [u8; 32],
    body: Vec<u8>,
) -> Result<(), ChainError> {
    let mut request_id = None;
    loop {
        match swarm.select_next_some().await {
            libp2p::swarm::SwarmEvent::ConnectionEstablished { peer_id, .. }
                if peer_id == peer && request_id.is_none() =>
            {
                request_id = Some(swarm.behaviour_mut().tx.send_request(
                    &peer,
                    TxRequest {
                        genesis,
                        body: body.clone(),
                    },
                ));
            }
            libp2p::swarm::SwarmEvent::OutgoingConnectionError { peer_id, .. }
                if peer_id == Some(peer) =>
            {
                return Err(ChainError::P2p("dial-failure"));
            }
            libp2p::swarm::SwarmEvent::Behaviour(NodeBehaviourEvent::Tx(
                request_response::Event::Message {
                    peer: responder,
                    message:
                        request_response::Message::Response {
                            request_id: response_id,
                            response,
                        },
                    ..
                },
            )) if responder == peer && Some(response_id) == request_id => {
                return tx_result(response);
            }
            libp2p::swarm::SwarmEvent::Behaviour(NodeBehaviourEvent::Tx(
                request_response::Event::OutboundFailure {
                    peer: responder,
                    error,
                    ..
                },
            )) if responder == peer => {
                return Err(ChainError::P2p(outbound_reason(error)));
            }
            _ => {}
        }
    }
}

fn tx_result(reply: TxReply) -> Result<(), ChainError> {
    if reply.ingested && reply.reason.is_none() {
        return Ok(());
    }
    Err(match reply.reason.as_deref() {
        Some("signature") => ChainError::UnverifiedSignature,
        Some("length") => ChainError::BadSignatureLength,
        Some("malformed") => ChainError::Malformed,
        Some("nonce") => ChainError::BadNonce,
        Some("balance") => ChainError::InsufficientBalance,
        Some("full") => ChainError::MempoolFull,
        Some("halt") => ChainError::EmergencyHalt,
        Some("account") => ChainError::BadAccount,
        Some("self") => ChainError::SelfTransfer,
        Some("admission") => ChainError::Admission("verdict"),
        Some("genesis") => ChainError::P2p("genesis"),
        _ => ChainError::P2p("tx"),
    })
}

fn tx_reason(error: &ChainError) -> &'static str {
    match error {
        ChainError::UnverifiedSignature | ChainError::BadProposerSignature => "signature",
        ChainError::BadSignatureLength => "length",
        ChainError::Malformed => "malformed",
        ChainError::BadNonce => "nonce",
        ChainError::InsufficientBalance => "balance",
        ChainError::MempoolFull => "full",
        ChainError::EmergencyHalt => "halt",
        ChainError::BadAccount => "account",
        ChainError::SelfTransfer => "self",
        ChainError::Admission(_) => "admission",
        _ => "refused",
    }
}

pub(crate) fn seal_timestamp(node: &ArkheNode, first: u64) -> Result<u64, ChainError> {
    let height = node.height()?;
    if height == 0 {
        return Ok(first);
    }
    node.header_at(height)?
        .timestamp
        .checked_add(1)
        .ok_or(ChainError::Overflow)
}

async fn answer_tx(node: &ArkheNode, seal: &Option<RemoteSeal>, request: TxRequest) -> TxReply {
    if request.genesis != node.genesis_hash() {
        return TxReply {
            ingested: false,
            reason: Some("genesis".to_string()),
        };
    }
    let body = request.body;
    if body.len() > TX_BODY_LIMIT {
        return TxReply {
            ingested: false,
            reason: Some("malformed".to_string()),
        };
    }
    let tx = match crate::codec::decode_tx(&body) {
        Ok(tx) => tx,
        Err(_) => {
            return TxReply {
                ingested: false,
                reason: Some("malformed".to_string()),
            };
        }
    };
    if let Err(error) = node.ingest(tx) {
        return TxReply {
            ingested: false,
            reason: Some(tx_reason(&error).to_string()),
        };
    }
    if let Some(seal) = seal {
        if seal.peers.is_empty() {
            if let Ok(timestamp) = seal_timestamp(node, seal.timestamp) {
                if let Ok(proposal) = node.propose_and_seal_block(timestamp) {
                    if proposal.block.is_some() {
                        let _ = attest_configured(node, &seal.secret, &seal.peers).await;
                    }
                }
            }
        }
    }
    TxReply {
        ingested: true,
        reason: None,
    }
}

fn answer(node: &ArkheNode, request: SyncRequest) -> SyncResponse {
    let body = match request {
        SyncRequest::Tip => node.tip().ok().map(|tip| tip.to_vec()),
        SyncRequest::Block { hash } => node.encoded_block(&hash).ok().flatten(),
        SyncRequest::Child { parent } => node.canonical_child(&parent).ok().flatten(),
    };
    SyncResponse {
        body,
        genesis: Some(node.genesis_hash()),
    }
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

enum Heard {
    Count(u64),
    Behind,
}

enum Stage {
    Tip,
    Have,
    Back,
}

async fn follow(
    swarm: &mut Swarm<Behaviour>,
    peer: PeerId,
    node: &ArkheNode,
) -> Result<Heard, ChainError> {
    let mut request_id = None;
    let mut stage = Stage::Tip;
    let mut announced = [0u8; 32];
    let mut local_tip = [0u8; 32];
    let mut cursor = [0u8; 32];
    let mut blocks = Vec::new();
    let mut steps = 0u64;
    loop {
        match swarm.select_next_some().await {
            libp2p::swarm::SwarmEvent::ConnectionEstablished { peer_id, .. } if peer_id == peer => {
                if request_id.is_none() {
                    request_id = Some(swarm.behaviour_mut().sync.send_request(&peer, SyncRequest::Tip));
                }
            }
            libp2p::swarm::SwarmEvent::OutgoingConnectionError { peer_id, .. }
                if peer_id == Some(peer) =>
            {
                return Err(ChainError::P2p("dial-failure"));
            }
            libp2p::swarm::SwarmEvent::Behaviour(NodeBehaviourEvent::Sync(
                request_response::Event::Message {
                peer: responder,
                message:
                    request_response::Message::Response {
                        request_id: response_id,
                        response,
                    },
                ..
            },
            )) if responder == peer && Some(response_id) == request_id => match stage {
                Stage::Tip => {
                    let remote = response.genesis.ok_or(ChainError::P2p("genesis"))?;
                    if remote != node.genesis_hash() {
                        return Err(ChainError::P2p("genesis"));
                    }
                    let hash = response
                        .body
                        .filter(|body| body.len() == 32)
                        .ok_or(ChainError::P2p("tip"))?;
                    announced.copy_from_slice(&hash);
                    local_tip = node.tip()?;
                    if local_tip == announced || announced_is_canonical(node, announced)? {
                        if local_tip == announced || node.load_sync_resume(announced)?.is_some() {
                            node.clear_sync_resume()?;
                        }
                        if local_tip == announced {
                            if local_tip == [0u8; 32] {
                                return Ok(Heard::Count(0));
                            }
                            stage = Stage::Have;
                            request_id = Some(
                                swarm.behaviour_mut().sync.send_request(
                                    &peer,
                                    SyncRequest::Block { hash: local_tip },
                                ),
                            );
                            continue;
                        }
                        return Ok(Heard::Behind);
                    }
                    if let Some(saved) = node.load_sync_resume(announced)? {
                        if saved.blocks.iter().any(|(hash, body)| {
                            body.len() > 2 * 1024 * 1024 || crate::tx::block_hash(body) != *hash
                        }) {
                            return Err(ChainError::P2p("hash"));
                        }
                        blocks = saved.blocks;
                        cursor = saved.cursor;
                    } else {
                        node.clear_sync_resume()?;
                        cursor = announced;
                    }
                    stage = Stage::Back;
                    request_id = Some(
                        swarm
                            .behaviour_mut()
                            .sync
                            .send_request(&peer, SyncRequest::Block { hash: cursor }),
                    );
                }
                Stage::Have => {
                    if let Some(remote) = response.genesis {
                        if remote != node.genesis_hash() {
                            return Err(ChainError::P2p("genesis"));
                        }
                    }
                    let Some(body) = response.body else {
                        return Ok(Heard::Behind);
                    };
                    if checked_header(local_tip, &body).is_err() {
                        return Ok(Heard::Behind);
                    }
                    return Ok(Heard::Count(0));
                }
                Stage::Back => {
                    let Some(body) = response.body else {
                        return Err(ChainError::P2p("fork"));
                    };
                    let header = checked_header(cursor, &body)?;
                    steps = steps.checked_add(1).ok_or(ChainError::Overflow)?;
                    if header.parent_hash == local_tip {
                        let hash = linked_child(local_tip, &body)?;
                        if hash != cursor {
                            return Err(ChainError::P2p("hash"));
                        }
                        node.clear_sync_resume()?;
                        import_synced(node, &body)?;
                        let mut expect_parent = hash;
                        for (stored_hash, stored_body) in blocks.iter().rev() {
                            let next = linked_child(expect_parent, stored_body)?;
                            if next != *stored_hash {
                                return Err(ChainError::P2p("hash"));
                            }
                            import_synced(node, stored_body)?;
                            expect_parent = next;
                        }
                        let imported = blocks.len().checked_add(1).ok_or(ChainError::Overflow)?;
                        return Ok(Heard::Count(
                            u64::try_from(imported).map_err(|_| ChainError::Overflow)?,
                        ));
                    }
                    match node.import_block(&body) {
                        Err(ChainError::Fork) => {
                            node.clear_sync_resume()?;
                            return Ok(Heard::Count(0));
                        }
                        Err(ChainError::Equivocation) => {
                            node.clear_sync_resume()?;
                            return Err(ChainError::Equivocation);
                        }
                        _ => {}
                    }
                    blocks.push((cursor, body));
                    if header.parent_hash == [0u8; 32] {
                        node.clear_sync_resume()?;
                        return Err(ChainError::P2p("fork"));
                    }
                    if steps == MAX_SYNC_BLOCKS {
                        node.store_sync_resume(SyncResume {
                            remote_tip: announced,
                            cursor: header.parent_hash,
                            blocks,
                        })?;
                        return Err(ChainError::P2p("sync-limit"));
                    }
                    cursor = header.parent_hash;
                    request_id = Some(
                        swarm
                            .behaviour_mut()
                            .sync
                            .send_request(&peer, SyncRequest::Block { hash: cursor }),
                    );
                }
            },
            libp2p::swarm::SwarmEvent::Behaviour(NodeBehaviourEvent::Sync(
                request_response::Event::OutboundFailure {
                peer: responder,
                error,
                ..
            },
            )) if responder == peer => {
                return Err(ChainError::P2p(outbound_reason(error)));
            }
            _ => {}
        }
    }
}

fn announced_is_canonical(node: &ArkheNode, announced: [u8; 32]) -> Result<bool, ChainError> {
    if announced == [0u8; 32] {
        return Ok(true);
    }
    let mut height = node.height()?;
    while height > 0 {
        if node.block_hash_at(height)? == announced {
            return Ok(true);
        }
        height -= 1;
    }
    Ok(false)
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
        .with_behaviour(|_| NodeBehaviour {
            sync: request_response::cbor::Behaviour::new(
                [(
                    StreamProtocol::new(SYNC_PROTOCOL),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            ),
            vote: request_response::cbor::Behaviour::new(
                [(
                    StreamProtocol::new(PRECOMMIT_PROTOCOL),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            ),
            tx: request_response::cbor::Behaviour::new(
                [(
                    StreamProtocol::new(TX_PROTOCOL),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            ),
        })
        .map_err(|err| match err {})?
        .with_swarm_config(|config| config.with_idle_connection_timeout(Duration::from_secs(60)))
        .build())
}

#[cfg(test)]
mod tests {
    use super::{vote_body_for_request, VOTE_BLOCK_LIMIT, VOTE_REQUEST_LIMIT};

    #[test]
    fn a_body_that_would_overflow_the_vote_request_is_left_out() {
        let small = vote_body_for_request(Some(vec![1]));
        assert_eq!(small.unwrap().len(), 1);
        let budget = vote_body_for_request(Some(vec![1; VOTE_BLOCK_LIMIT]));
        assert_eq!(budget.unwrap().len(), VOTE_BLOCK_LIMIT);
        assert!(vote_body_for_request(Some(vec![1; VOTE_BLOCK_LIMIT + 1])).is_none());
        assert!(vote_body_for_request(Some(vec![1; VOTE_REQUEST_LIMIT])).is_none());
        assert!(vote_body_for_request(None).is_none());
    }
}
