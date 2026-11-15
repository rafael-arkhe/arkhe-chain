use std::fs::{File, OpenOptions, TryLockError};
use std::path::{Path, PathBuf};

use libp2p::{multiaddr::Protocol, Multiaddr, PeerId};

use crate::p2p::{attest_pass, listen_on, seal_timestamp, sync_pass, RemoteSeal};
use crate::{
    codec, spawn_server_on, submit_tx, Account, ArkheNode, Attestation, ChainError,
    ConfiguredPeer, Grant, Role, SyncServer, Transaction, Validator,
};

/// Read the operator genesis. A validator line is `validator <id> <ed25519 hex>`.
/// An account line is `account <id> <ed25519 hex>` or the same plus an ML-DSA-65
/// public key in hex. A grant line is checked here and returned by
/// [`parse_genesis_grants`]. Blank lines and `#` comments are skipped. This
/// file does not set balances and does not name peers.
pub fn parse_genesis(text: &str) -> Result<(Vec<Validator>, Vec<Account>), ChainError> {
    let (validators, accounts, _) = parse_genesis_lines(text)?;
    Ok((validators, accounts))
}

/// The role grants of the attestation policy, in file order. A grant line is
/// `grant <account> <role> <grantor> <last height>`, with the role one of
/// `requester`, `author`, `evaluator` or `approver`. Whether the two accounts
/// exist is checked when the chain is opened, not here.
pub fn parse_genesis_grants(text: &str) -> Result<Vec<Grant>, ChainError> {
    Ok(parse_genesis_lines(text)?.2)
}

fn parse_genesis_lines(text: &str) -> Result<(Vec<Validator>, Vec<Account>, Vec<Grant>), ChainError> {
    let mut validators = Vec::new();
    let mut accounts = Vec::new();
    let mut grants = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        match parts.next() {
            Some("validator") => {
                let id = parts.next().ok_or(ChainError::Malformed)?;
                let key = parts.next().ok_or(ChainError::Malformed)?;
                if parts.next().is_some() {
                    return Err(ChainError::Malformed);
                }
                validators.push(Validator {
                    id: id.to_string(),
                    public_key: decode_fixed(key)?,
                });
            }
            Some("account") => {
                let id = parts.next().ok_or(ChainError::Malformed)?;
                let key = parts.next().ok_or(ChainError::Malformed)?;
                let mldsa = match parts.next() {
                    None => None,
                    Some(hex) if parts.next().is_none() => Some(decode_fixed(hex)?),
                    Some(_) => return Err(ChainError::Malformed),
                };
                accounts.push(Account {
                    id: id.to_string(),
                    public_key: decode_fixed(key)?,
                    mldsa_public_key: mldsa,
                });
            }
            Some("grant") => {
                let delegate = parts.next().ok_or(ChainError::Malformed)?;
                let role = parts.next().and_then(Role::from_name).ok_or(ChainError::Malformed)?;
                let grantor = parts.next().ok_or(ChainError::Malformed)?;
                let expires = parts.next().ok_or(ChainError::Malformed)?;
                // Only the digits `u64` prints, so the line and the hash agree.
                let height: u64 = expires.parse().map_err(|_| ChainError::Malformed)?;
                if parts.next().is_some() || height.to_string() != expires {
                    return Err(ChainError::Malformed);
                }
                grants.push(Grant {
                    delegate: delegate.to_string(),
                    role,
                    grantor: grantor.to_string(),
                    expires: height,
                });
            }
            _ => return Err(ChainError::Malformed),
        }
    }
    if validators.is_empty() {
        return Err(ChainError::EmptyValidators);
    }
    Ok((validators, accounts, grants))
}

#[derive(Clone, PartialEq, Eq)]
pub struct ChainStatus {
    pub height: u64,
    pub committed: u64,
    pub tip: [u8; 32],
    pub mempool: u64,
    pub forks: u64,
    pub genesis: Option<[u8; 32]>,
}

/// The lines printed by `--status`. This does not read or write a file.
pub fn format_status(status: &ChainStatus) -> String {
    let mut tip = String::with_capacity(64);
    for byte in status.tip {
        tip.push_str(&format!("{byte:02x}"));
    }
    let genesis = match status.genesis {
        Some(hash) => encode_hex(&hash),
        None => "absent".to_string(),
    };
    format!(
        "height {}\ncommitted {}\ntip {tip}\nmempool {}\nforks {}\ngenesis {genesis}\n",
        status.height, status.committed, status.mempool, status.forks
    )
}

/// A new status line when height, committed height, tip, mempool, forks, or the
/// stored genesis hash changed. The same values return nothing. This is not a
/// new consensus round.
pub fn next_status_line(previous: &ChainStatus, next: &ChainStatus) -> Option<String> {
    if previous == next {
        None
    } else {
        Some(format_status(next))
    }
}

/// Read height, committed height, tip, waiting transactions, forks, and the
/// stored genesis hash. A file without the 32-byte trailer reports no hash.
/// This does not open a listener and does not rewrite the file.
pub fn read_status(path: &Path) -> Result<ChainStatus, ChainError> {
    let bytes = std::fs::read(path).map_err(|_| ChainError::Snapshot)?;
    let snap = crate::persist::decode_snapshot(&bytes)?;
    Ok(ChainStatus {
        height: snap.height,
        committed: snap.committed,
        tip: snap.tip,
        mempool: u64::try_from(snap.mempool.len()).map_err(|_| ChainError::Snapshot)?,
        forks: u64::try_from(snap.forks.len()).map_err(|_| ChainError::Snapshot)?,
        genesis: snap.genesis,
    })
}

/// One line per validator, in file order: `<id> <peer id>`. The peer id is
/// the libp2p id of that Ed25519 key. This does not open a chain and does not
/// discover peers.
pub fn genesis_peer_lines(text: &str) -> Result<String, ChainError> {
    let (validators, _) = parse_genesis(text)?;
    let mut out = String::new();
    for validator in validators {
        let peer = crate::peer_id_from_bytes(&validator.public_key)?;
        out.push_str(&validator.id);
        out.push(' ');
        out.push_str(&peer.to_string());
        out.push('\n');
    }
    Ok(out)
}

pub struct GenesisFingerprint {
    pub validators: u64,
    pub accounts: u64,
    pub hash: [u8; 32],
}

/// BLAKE3 of the parsed genesis: validators, then accounts, then grants, each
/// in file order. Blank lines and `#` comments are not part of the hash. This does not open a chain and does not name peers.
pub fn genesis_fingerprint(text: &str) -> Result<GenesisFingerprint, ChainError> {
    let (validators, accounts, grants) = parse_genesis_lines(text)?;
    Ok(GenesisFingerprint {
        validators: u64::try_from(validators.len()).map_err(|_| ChainError::Overflow)?,
        accounts: u64::try_from(accounts.len()).map_err(|_| ChainError::Overflow)?,
        hash: genesis_hash(&validators, &accounts, &grants)?,
    })
}

pub(crate) fn genesis_hash(
    validators: &[crate::Validator],
    accounts: &[crate::Account],
    grants: &[crate::Grant],
) -> Result<[u8; 32], ChainError> {
    let mut canonical = String::new();
    for validator in validators {
        canonical.push_str("validator ");
        canonical.push_str(&validator.id);
        canonical.push(' ');
        canonical.push_str(&encode_hex(&validator.public_key));
        canonical.push('\n');
    }
    for account in accounts {
        canonical.push_str("account ");
        canonical.push_str(&account.id);
        canonical.push(' ');
        canonical.push_str(&encode_hex(&account.public_key));
        if let Some(key) = &account.mldsa_public_key {
            canonical.push(' ');
            canonical.push_str(&encode_hex(key));
        }
        canonical.push('\n');
    }
    // No grant adds no line, so a genesis without grants keeps its hash.
    for grant in grants {
        canonical.push_str(&format!(
            "grant {} {} {} {}\n",
            grant.delegate,
            grant.role.name(),
            grant.grantor,
            grant.expires
        ));
    }
    Ok(*blake3::hash(canonical.as_bytes()).as_bytes())
}

/// The three lines printed by `--show-genesis`.
pub fn format_genesis(fingerprint: &GenesisFingerprint) -> String {
    format!(
        "validators {}\naccounts {}\nblake3 {}\n",
        fingerprint.validators,
        fingerprint.accounts,
        encode_hex(&fingerprint.hash)
    )
}

pub fn parse_secret_hex(text: &str) -> Result<[u8; 32], ChainError> {
    decode_fixed(text.trim())
}

/// `addr` must end in exactly one `/p2p/<peer id>`. The returned address is
/// the part before that protocol. `sync_configured` adds the peer id itself.
pub fn parse_configured_peer(text: &str) -> Result<ConfiguredPeer, ChainError> {
    let parsed: Multiaddr = text.parse().map_err(|_| ChainError::Malformed)?;
    let mut peer_id = None;
    let mut addr = Multiaddr::empty();
    for protocol in parsed.iter() {
        match protocol {
            Protocol::P2p(id) if peer_id.is_none() => peer_id = Some(id),
            Protocol::P2p(_) => return Err(ChainError::Malformed),
            other => addr.push(other),
        }
    }
    if addr.is_empty() {
        return Err(ChainError::Malformed);
    }
    Ok(ConfiguredPeer {
        addr,
        peer_id: peer_id.ok_or(ChainError::Malformed)?,
    })
}

#[derive(Debug)]
pub struct PeerFile {
    pub peers: Vec<ConfiguredPeer>,
    /// Set when the file has a `# genesis <64 hex>` line. This is not a peer
    /// and it does not discover anyone. Two different hashes are `Malformed`.
    pub genesis: Option<[u8; 32]>,
}

/// Read `--peer` values from a file. Blank lines and `#` comments are skipped.
/// A `# genesis <64 hex>` line records the announcer's genesis BLAKE3. The
/// file does not discover peers. A missing file is `Snapshot`. A line that
/// is not one `/p2p/<id>` address is `Malformed`.
pub fn read_peer_file(path: &Path) -> Result<PeerFile, ChainError> {
    let text = std::fs::read_to_string(path).map_err(|_| ChainError::Snapshot)?;
    // PowerShell `Set-Content -Encoding utf8` may prefix a BOM; that must not
    // turn `# genesis <hash>` into a peer line.
    let text = text.strip_prefix('\u{feff}').unwrap_or(text.as_str());
    let mut peers = Vec::new();
    let mut genesis = None;
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || (line.starts_with('#') && !line.starts_with("# genesis ")) {
            continue;
        }
        if let Some(hex_text) = line.strip_prefix("# genesis ") {
            let hash = decode_fixed(hex_text)?;
            match genesis {
                Some(stored) if stored != hash => return Err(ChainError::Malformed),
                Some(_) => {}
                None => genesis = Some(hash),
            }
            continue;
        }
        peers.push(parse_configured_peer(line)?);
    }
    Ok(PeerFile { peers, genesis })
}

pub struct OperatorRequest {
    pub data: std::path::PathBuf,
    pub id: String,
    pub secret: [u8; 32],
    pub genesis: String,
    pub listen: Multiaddr,
    pub peers: Vec<ConfiguredPeer>,
    pub once: bool,
    pub txs: Vec<u8>,
    /// Set only together with a transaction list the operator should seal.
    pub seal_at: Option<u64>,
    /// When set, the bound listen address, including `/p2p/<id>`, is written
    /// here as one line. That line is a `--peer` value. This does not discover
    /// peers. A failed write stops the listener and returns `Snapshot`.
    pub announce: Option<std::path::PathBuf>,
}

/// One file taken by [`OperatorHandle::take_inbox`]: its name and how many
/// transactions it ingested, or why it was rejected.
pub struct InboxFile {
    pub name: String,
    pub outcome: Result<usize, ChainError>,
}

pub struct OperatorHandle {
    pub listen: Multiaddr,
    pub peer_id: PeerId,
    node: std::sync::Arc<ArkheNode>,
    secret: [u8; 32],
    peers: Vec<ConfiguredPeer>,
    seal_at: Option<u64>,
    #[allow(dead_code)]
    server: SyncServer,
    #[allow(dead_code)]
    lock: File,
}

impl OperatorHandle {
    /// The bound address plus this validator's peer id. The result is a
    /// `--peer` value. It does not discover anyone.
    pub fn listen_line(&self) -> Multiaddr {
        self.listen
            .clone()
            .with(Protocol::P2p(self.peer_id))
    }

    /// Height, committed height, tip, mempool, forks, and the genesis hash of
    /// this process. This does not read the file again and does not rewrite it.
    pub fn status(&self) -> Result<ChainStatus, ChainError> {
        Ok(ChainStatus {
            height: self.node.height()?,
            committed: self.node.committed_height()?,
            tip: self.node.tip()?,
            mempool: u64::try_from(self.node.mempool_len()?).map_err(|_| ChainError::Snapshot)?,
            forks: u64::try_from(self.node.fork_count()?).map_err(|_| ChainError::Snapshot)?,
            genesis: Some(self.node.genesis_hash()),
        })
    }

    /// Dial the named peers again, then sign round 0 of the next height that
    /// already exists. A named peer whose tip is already on this chain does
    /// not fail this call and does not change the tip. A walk that stops at
    /// 128 headers keeps the cursor and does not fail this call. The next
    /// call continues it. A refused dial, a peer that stays silent for 30
    /// seconds, a closed connection, a request that is not answered in 10
    /// seconds, a response the codec cannot read, and a peer that does not
    /// speak the protocol do not fail this call. The next call tries again.
    /// Nothing from that failure is stored. Equivocation and a different
    /// genesis still fail the call. A seal waits until this pass has heard
    /// every named peer. A peer that was not reached does not let another
    /// answer seal. A peer whose announced tip is a canonical ancestor, and
    /// not this tip, does not let this pass seal the next block. Announcing
    /// this tip without the block body does not release the seal either.
    /// A body that does not match this tip does not release it and does not
    /// stop the pass. The zero tip has no body. A different genesis still
    /// fails the pass when another named peer answered, and no block is
    /// sealed. A body whose hash is not the one requested fails the pass
    /// the same way: the other peer's block can stay imported, and the
    /// local transaction is not sealed. A body that does not decode fails
    /// the pass the same way. An announced tip that is not 32 bytes fails
    /// the pass the same way. A missing body, which returns `P2p("fork")`
    /// and stores nothing, fails the pass the same way. A sibling that was
    /// stored is not that failure. A peer that is not a validator fails the
    /// pass the same way, before the dial. A vote refused for a different
    /// genesis fails the pass when another validator accepted a vote. The
    /// block sealed earlier in that pass stays. A vote refused for a
    /// different chain id fails the pass the same way and does not change
    /// the tip. A vote refused for a different part set fails the pass the
    /// same way and does not change the tip. A vote refused for a lower
    /// round fails the pass the same way and does not change the tip. A vote
    /// refused for a bad proposer signature fails the pass the same way and
    /// does not change the tip. A vote refused because the signer is not the
    /// proposer fails the pass the same way and does not change the tip. A
    /// vote refused for any other reason fails the pass the same way and
    /// does not change the tip. A height that does not commit does not stop
    /// the walk: the next sealed block is still sent, the tip does not
    /// change, and committing that later height stays `CommitGap`. A block
    /// body that would push the vote request past 1 MiB is left out. The
    /// vote is still sent and the tip does not change. A synced body whose
    /// proposer signature does not verify fails the pass the same way, before
    /// the seal, even when another named peer imported a block. A synced body
    /// whose proposer is not a validator fails the pass the same way and does
    /// not seal. A synced body whose height does not follow its parent fails
    /// the pass the same way and does not seal. A synced body whose state root
    /// or MMR count does not match the replay fails the pass the same way and
    /// does not seal. A synced body whose timestamp is zero fails the pass
    /// the same way and does not seal. A synced body whose sender signature
    /// does not verify fails the pass the same way and does not seal. The
    /// proposer signature still verifies. A synced body whose transaction
    /// nonce is not the next one fails the pass the same way and does not
    /// seal. Both sender signatures still verify. A synced body that
    /// transfers to its own sender fails the pass the same way and does not
    /// seal. The nonce is the next one. A synced body that spends more than
    /// the sender holds fails the pass the same way and does not seal. The
    /// recipient is someone else. A synced body whose verdict is not Allow
    /// fails the pass the same way and does not seal. Both sender signatures
    /// still verify. A synced body whose Allow verdict names another subject
    /// fails the pass the same way and does not seal. A decoded verdict
    /// re-encodes to the same bytes. A synced body whose payload does not
    /// decode as a verdict fails the pass the same way and does not seal.
    /// A synced body whose payload is longer than 4096 bytes does not decode.
    /// Alone, that result stays `Malformed` and does not seal. A loose
    /// transfer with that payload stays `Admission("payload")` at ingest and
    /// does not enter a block. The re-encode check does not fire. A synced
    /// body whose ML-DSA signature is neither empty nor 3309 bytes does not
    /// decode. Alone, that result stays `BadSignatureLength` and does not
    /// seal. An empty field stays `UnverifiedSignature`. A longer field stays
    /// `Malformed`. A synced body whose account contains a character outside
    /// the allowed set does not decode. Alone, that result stays
    /// `BadAccount` and does not seal. An empty name, or one longer than 128
    /// bytes, stays `Malformed`. A synced body whose attestation version is
    /// not 1, or whose scheme is not 1, fails the pass the same way and does
    /// not seal. A synced body whose attestation names another chain, genesis,
    /// or audience fails the pass the same way and does not seal. The version
    /// and the scheme stay 1. A synced body whose attestation window does not
    /// cover the block height fails the pass the same way and does not seal.
    /// The version, the scheme, the chain, the genesis, and the audience
    /// match. A window whose start is after its end returns the same error.
    /// A synced body that admits the same signer nonce twice fails the pass
    /// the same way and does not seal. The signature verifies. A synced body
    /// that revokes a role the registry never granted fails the pass the same
    /// way and does not seal. The signer is `genesis-alloc`. A grant given by
    /// someone else returns the same error. A synced body that executes an
    /// approval the registry does not contain fails the pass the same way and
    /// does not seal. The approval, the action, and the artifact are 32 zero
    /// bytes. A synced body that admits a request and then executes that id
    /// fails the pass the same way and does not seal. The request is not an
    /// approval, and nothing from that body is stored. A synced body that
    /// executes an approval whose policy digest is 32 zero bytes fails the
    /// pass the same way and does not seal. The same grant is part of the
    /// genesis: `genesis-alloc` may approve through height 10. The action and
    /// the artifact are not checked. A synced body that executes a different
    /// action fails the pass the same way and does not seal. The policy digest
    /// matches the registry. The artifact is not checked. A synced body that
    /// executes a different artifact fails the pass the same way and does not
    /// seal. The policy digest and the action match. The evaluation is not
    /// checked. A synced body that executes an approval whose evaluation is
    /// 32 zero bytes fails the pass the same way and does not seal. The
    /// policy digest, the action, and the artifact match. The evaluation is
    /// not in the registry. An evaluation that is not an Evaluation claim, or
    /// whose artifact differs, returns the same error. A synced body that
    /// executes an approval whose evaluation is present and failed fails the
    /// pass the same way and does not seal. The policy digest, the action,
    /// and the artifact match. The evaluation window and the evaluator role
    /// are not checked. A synced body that uses the same signer for the
    /// evaluation and the approval fails the pass the same way and does not
    /// seal. The evaluation passed. The same grants are part of the genesis:
    /// `genesis-alloc` may approve and evaluate through height 10. An author
    /// who is also the approver or the evaluator returns the same error. A
    /// synced body that executes the same approval twice fails the pass the
    /// same way and does not seal. The first execution would succeed: distinct
    /// requester, author, evaluator, and approver, with matching grants in the
    /// genesis. A synced body that admits one more attestation from a signer
    /// who already holds 64 fails the pass the same way and does not seal. The
    /// local tip already carries those 64. A synced body that admits one more
    /// attestation when the registry already holds 4096 leaves fails the pass
    /// the same way and does not seal. The local tip already carries those
    /// 4096. Any other attestation error still stops the list. Until then the transactions stay in the
    /// mempool and no block is produced. A peer that answered with a fork
    /// is not a missed peer and is not behind. A transaction reply does not
    /// dial, so a submitted transaction
    /// waits in the mempool until this pass. An empty peer list still seals
    /// before the reply. This does
    /// not discover peers and does not open a later round.
    /// Ingest every `*.txs` and `*.ops` file in `dir`, in file-name order. A
    /// `*.txs` file is a list from [`encode_tx_list`]. A `*.ops` file is a
    /// list from [`encode_attestation_list`]; each signed attestation is
    /// queued with [`ArkheNode::submit_attestation`]. A file that ingests
    /// whole is renamed to `<name>.done`. A file that fails is renamed to
    /// `<name>.rejected`; the items before the failing one stay queued. Nothing is sealed
    /// here: the next [`catch_up`](Self::catch_up) seals what waits. The
    /// directory is local. Whoever can write to it can submit, and there is
    /// no other authentication. A writer must rename a finished file into
    /// place, because a half-written `*.txs` is read as it is.
    pub fn take_inbox(&self, dir: &Path) -> Result<Vec<InboxFile>, ChainError> {
        let mut names = Vec::new();
        for entry in std::fs::read_dir(dir).map_err(|_| ChainError::Snapshot)? {
            let path = entry.map_err(|_| ChainError::Snapshot)?.path();
            if path.extension().is_some_and(|ext| ext == "txs" || ext == "ops") && path.is_file() {
                names.push(path);
            }
        }
        names.sort();
        let mut taken = Vec::new();
        for path in names {
            let outcome = std::fs::read(&path)
                .map_err(|_| ChainError::Snapshot)
                .and_then(|bytes| {
                    if path.extension().is_some_and(|ext| ext == "ops") {
                        submit_attestation_list(&self.node, &bytes)
                    } else {
                        ingest_tx_list(&self.node, &bytes)
                    }
                });
            let mut moved = path.clone().into_os_string();
            moved.push(if outcome.is_ok() { ".done" } else { ".rejected" });
            std::fs::rename(&path, PathBuf::from(moved)).map_err(|_| ChainError::Snapshot)?;
            taken.push(InboxFile {
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                outcome,
            });
        }
        Ok(taken)
    }

    pub async fn catch_up(&self) -> Result<u64, ChainError> {
        let heard = heard_every_peer(&self.node, &self.peers).await?;
        if heard {
            if let Some(first) = self.seal_at {
                if self.node.mempool_len()? > 0 || self.node.attest_pool_len()? > 0 {
                    let timestamp = seal_timestamp(&self.node, first)?;
                    let proposal = self.node.propose_and_seal_block(timestamp)?;
                    if proposal.block.is_none() && proposal.rejected.is_empty() {
                        return Err(ChainError::MempoolEmpty);
                    }
                }
            }
        }
        match attest_for_operator(&self.node, &self.secret, &self.peers).await {
            Ok(height) => Ok(height),
            Err(error) => {
                retry_on_the_next_pass(error)?;
                self.node.committed_height()
            }
        }
    }
}

/// Length-prefixed canonical transactions. Each item is a `u32` byte count
/// followed by [`codec::encode_tx`].
pub fn encode_tx_list(txs: &[Transaction]) -> Result<Vec<u8>, ChainError> {
    let mut out = Vec::new();
    for tx in txs {
        let body = codec::encode_tx(tx);
        let len = u32::try_from(body.len()).map_err(|_| ChainError::Overflow)?;
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(&body);
    }
    Ok(out)
}

/// Length-prefixed signed attestations, in the encoding a block carries.
pub fn encode_attestation_list(atts: &[Attestation]) -> Result<Vec<u8>, ChainError> {
    let mut out = Vec::new();
    for att in atts {
        let body = codec::encode_attestation(att);
        let len = u32::try_from(body.len()).map_err(|_| ChainError::Overflow)?;
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(&body);
    }
    Ok(out)
}

/// Queue every attestation in a list from [`encode_attestation_list`]. A
/// short, malformed or refused item queues nothing after it. Earlier items
/// stay queued.
pub fn submit_attestation_list(node: &ArkheNode, bytes: &[u8]) -> Result<usize, ChainError> {
    let mut i = 0;
    let mut count = 0usize;
    while i < bytes.len() {
        if bytes.len() - i < 4 {
            return Err(ChainError::Malformed);
        }
        let len = u32::from_be_bytes(bytes[i..i + 4].try_into().map_err(|_| ChainError::Malformed)?)
            as usize;
        i += 4;
        if len == 0 || bytes.len() - i < len {
            return Err(ChainError::Malformed);
        }
        node.submit_attestation(codec::decode_attestation(&bytes[i..i + len])?)?;
        i += len;
        count += 1;
    }
    Ok(count)
}

/// Read a list from [`encode_tx_list`] without ingesting it.
pub fn decode_tx_list(bytes: &[u8]) -> Result<Vec<Transaction>, ChainError> {
    let mut i = 0;
    let mut txs = Vec::new();
    while i < bytes.len() {
        if bytes.len() - i < 4 {
            return Err(ChainError::Malformed);
        }
        let len = u32::from_be_bytes(bytes[i..i + 4].try_into().map_err(|_| ChainError::Malformed)?)
            as usize;
        i += 4;
        if len == 0 || bytes.len() - i < len {
            return Err(ChainError::Malformed);
        }
        txs.push(codec::decode_tx(&bytes[i..i + len])?);
        i += len;
    }
    Ok(txs)
}

/// Ingest every transaction in a list from [`encode_tx_list`]. A short or
/// malformed item ingests nothing after it. Earlier items stay in the mempool.
pub fn ingest_tx_list(node: &ArkheNode, bytes: &[u8]) -> Result<usize, ChainError> {
    let mut i = 0;
    let mut count = 0usize;
    while i < bytes.len() {
        if bytes.len() - i < 4 {
            return Err(ChainError::Malformed);
        }
        let len = u32::from_be_bytes(bytes[i..i + 4].try_into().map_err(|_| ChainError::Malformed)?)
            as usize;
        i += 4;
        if len == 0 || bytes.len() - i < len {
            return Err(ChainError::Malformed);
        }
        let tx = codec::decode_tx(&bytes[i..i + len])?;
        i += len;
        node.ingest(tx)?;
        count += 1;
    }
    Ok(count)
}

/// Open `data` and listen. Dial the named peers. A process that is not sealing
/// sends `txs` to those peers. A sealing process with local transactions seals
/// one block at `seal_at`. A sealing process with no local transactions and
/// without `once` waits and seals the first transaction a named peer submits.
/// Then it signs round 0 for the next height that exists. The caller keeps the
/// handle to leave the listener up. Dropping it stops the listener. `--seal`
/// on two processes can fork. This does not choose a proposer. The process
/// holds `<data>.lock` until the handle is dropped. A second process on the
/// same file is `Busy` and does not open it. `--status` does not take the lock.
/// A lock file left by a finished process does not block the next start.
/// When this start created the file and dialing fails before any block,
/// transaction, or sibling is stored, that file is removed. A file that
/// already existed is left in place.
pub async fn run_operator(request: OperatorRequest) -> Result<OperatorHandle, ChainError> {
    let lock = lock_chain(&request.data)?;
    let created = !request.data.exists();
    let (validators, accounts, grants) = parse_genesis_lines(&request.genesis)?;
    if request.data.exists() {
        let bytes = std::fs::read(&request.data).map_err(|_| ChainError::Snapshot)?;
        let snap = crate::persist::decode_snapshot(&bytes)?;
        match snap.genesis {
            Some(stored) if stored == genesis_hash(&validators, &accounts, &grants)? => {}
            _ => return Err(ChainError::Genesis),
        }
    }
    let node = std::sync::Arc::new(ArkheNode::open_with_grants(
        &request.data,
        &request.id,
        &request.secret,
        validators,
        accounts,
        grants,
    )?);
    let mut fresh = FreshChain {
        path: request.data.clone(),
        created,
        node: std::sync::Arc::clone(&node),
    };
    let wait_for_tx = request.seal_at.is_some() && request.txs.is_empty() && !request.once;
    let server = if wait_for_tx {
        listen_on(
            std::sync::Arc::clone(&node),
            request.listen,
            Some(RemoteSeal {
                timestamp: request.seal_at.expect("seal_at"),
                secret: request.secret,
                peers: request.peers.clone(),
            }),
        )
        .await?
    } else {
        spawn_server_on(std::sync::Arc::clone(&node), request.listen).await?
    };
    let forward = request.seal_at.is_none() && !request.peers.is_empty() && !request.txs.is_empty();
    if forward {
        for tx in decode_tx_list(&request.txs)? {
            for peer in &request.peers {
                submit_tx(&node, peer.addr.clone(), peer.peer_id, &tx).await?;
            }
        }
    }
    let heard = heard_every_peer(&node, &request.peers).await?;
    if !request.txs.is_empty() && !forward {
        ingest_tx_list(&node, &request.txs)?;
    }
    if request.seal_at.is_some() && !wait_for_tx && heard {
        let timestamp = seal_timestamp(&node, request.seal_at.expect("seal_at"))?;
        let proposal = node.propose_and_seal_block(timestamp)?;
        if proposal.block.is_none() {
            return Err(proposal
                .rejected
                .into_iter()
                .next()
                .unwrap_or(ChainError::MempoolEmpty));
        }
    }
    if !wait_for_tx {
        match attest_for_operator(&node, &request.secret, &request.peers).await {
            Ok(height) => Ok(height),
            Err(error) => {
                retry_on_the_next_pass(error)?;
                node.committed_height()
            }
        }?;
    }
    let handle = OperatorHandle {
        listen: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
        node,
        secret: request.secret,
        peers: request.peers,
        seal_at: request.seal_at,
        server,
        lock,
    };
    if let Some(path) = &request.announce {
        let line = format!(
            "{}\n# genesis {}\n",
            handle.listen_line(),
            encode_hex(&handle.node.genesis_hash())
        );
        std::fs::write(path, line).map_err(|_| ChainError::Snapshot)?;
    }
    fresh.created = false;
    Ok(handle)
}

async fn heard_every_peer(
    node: &ArkheNode,
    peers: &[ConfiguredPeer],
) -> Result<bool, ChainError> {
    if peers.is_empty() {
        return Ok(true);
    }
    match sync_pass(node, peers).await {
        Ok(pass) if pass.foreign_genesis => Err(ChainError::P2p("genesis")),
        Ok(pass) if pass.bad_hash => Err(ChainError::P2p("hash")),
        Ok(pass) if pass.malformed => Err(ChainError::Malformed),
        Ok(pass) if pass.short_tip => Err(ChainError::P2p("tip")),
        Ok(pass) if pass.unstored_fork => Err(ChainError::P2p("fork")),
        Ok(pass) if pass.outsider => Err(ChainError::P2p("peer")),
        Ok(pass) if pass.bad_proposer => Err(ChainError::BadProposerSignature),
        Ok(pass) if pass.unknown_proposer => Err(ChainError::NotProposer),
        Ok(pass) if pass.parent_mismatch => Err(ChainError::ParentMismatch),
        Ok(pass) if pass.state_mismatch => Err(ChainError::StateMismatch),
        Ok(pass) if pass.bad_timestamp => Err(ChainError::BadTimestamp),
        Ok(pass) if pass.unverified_sender => Err(ChainError::UnverifiedSignature),
        Ok(pass) if pass.bad_nonce => Err(ChainError::BadNonce),
        Ok(pass) if pass.self_transfer => Err(ChainError::SelfTransfer),
        Ok(pass) if pass.short_balance => Err(ChainError::InsufficientBalance),
        Ok(pass) if pass.not_allow => Err(ChainError::Admission("not-allow")),
        Ok(pass) if pass.foreign_subject => Err(ChainError::Admission("subject")),
        Ok(pass) if pass.bad_verdict => Err(ChainError::Admission("verdict")),
        Ok(pass) if pass.bad_signature_length => Err(ChainError::BadSignatureLength),
        Ok(pass) if pass.bad_account => Err(ChainError::BadAccount),
        Ok(pass) if pass.attest_version => Err(ChainError::Attest("version")),
        Ok(pass) if pass.attest_domain => Err(ChainError::Attest("domain")),
        Ok(pass) if pass.attest_window => Err(ChainError::Attest("window")),
        Ok(pass) if pass.attest_replay => Err(ChainError::Attest("replay")),
        Ok(pass) if pass.attest_authority => Err(ChainError::Attest("authority")),
        Ok(pass) if pass.attest_unknown => Err(ChainError::Attest("unknown")),
        Ok(pass) if pass.attest_kind => Err(ChainError::Attest("kind")),
        Ok(pass) if pass.attest_policy => Err(ChainError::Attest("policy")),
        Ok(pass) if pass.attest_action => Err(ChainError::Attest("action")),
        Ok(pass) if pass.attest_artifact => Err(ChainError::Attest("artifact")),
        Ok(pass) if pass.attest_link => Err(ChainError::Attest("link")),
        Ok(pass) if pass.attest_evaluation => Err(ChainError::Attest("evaluation")),
        Ok(pass) if pass.attest_separation => Err(ChainError::Attest("separation")),
        Ok(pass) if pass.attest_consumed => Err(ChainError::Attest("consumed")),
        Ok(pass) if pass.attest_quota => Err(ChainError::Attest("quota")),
        Ok(pass) if pass.attest_full => Err(ChainError::Attest("full")),
        Ok(pass) => Ok(!pass.missed && !pass.behind),
        Err(error) => {
            retry_on_the_next_pass(error)?;
            Ok(false)
        }
    }
}

fn retry_on_the_next_pass(error: ChainError) -> Result<u64, ChainError> {
    match error {
        ChainError::P2p(
            "sync-limit"
            | "dial-failure"
            | "timeout"
            | "connection-closed"
            | "rr-timeout"
            | "io"
            | "unsupported-protocol",
        ) => Ok(0),
        other => Err(other),
    }
}

async fn attest_for_operator(
    node: &ArkheNode,
    secret: &[u8; 32],
    peers: &[ConfiguredPeer],
) -> Result<u64, ChainError> {
    match attest_pass(node, secret, peers).await {
        Ok(pass) if pass.foreign_genesis => Err(ChainError::P2p("genesis")),
        Ok(pass) if pass.foreign_chain => Err(ChainError::ChainId),
        Ok(pass) if pass.bad_part => Err(ChainError::BadPartSet),
        Ok(pass) if pass.round_regression => Err(ChainError::RoundRegression),
        Ok(pass) if pass.bad_signature => Err(ChainError::BadProposerSignature),
        Ok(pass) if pass.bad_proposer => Err(ChainError::NotProposer),
        Ok(pass) if pass.refused_vote => Err(ChainError::P2p("vote")),
        Ok(pass) => Ok(pass.committed),
        Err(error) => {
            retry_on_the_next_pass(error)?;
            node.committed_height()
        }
    }
}

struct FreshChain {
    path: PathBuf,
    created: bool,
    node: std::sync::Arc<ArkheNode>,
}

impl Drop for FreshChain {
    fn drop(&mut self) {
        if !self.created {
            return;
        }
        let empty = matches!(self.node.height(), Ok(0))
            && matches!(self.node.committed_height(), Ok(0))
            && matches!(self.node.mempool_len(), Ok(0))
            && matches!(self.node.fork_count(), Ok(0));
        if empty {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

pub fn read_operator_files(
    key_path: &Path,
    genesis_path: &Path,
) -> Result<([u8; 32], String), ChainError> {
    let key = std::fs::read_to_string(key_path).map_err(|_| ChainError::Snapshot)?;
    let genesis = std::fs::read_to_string(genesis_path).map_err(|_| ChainError::Snapshot)?;
    Ok((parse_secret_hex(&key)?, genesis))
}

fn chain_lock_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".lock");
    PathBuf::from(name)
}

fn lock_chain(path: &Path) -> Result<File, ChainError> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(chain_lock_path(path))
        .map_err(|_| ChainError::Snapshot)?;
    match file.try_lock() {
        Ok(()) => Ok(file),
        Err(TryLockError::WouldBlock) => Err(ChainError::Busy),
        Err(TryLockError::Error(_)) => Err(ChainError::Snapshot),
    }
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode_fixed<const N: usize>(hex_text: &str) -> Result<[u8; N], ChainError> {
    if hex_text.len() != N * 2 || !hex_text.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(ChainError::Malformed);
    }
    let mut out = [0u8; N];
    for (index, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex_text[index * 2..index * 2 + 2], 16)
            .map_err(|_| ChainError::Malformed)?;
    }
    Ok(out)
}
