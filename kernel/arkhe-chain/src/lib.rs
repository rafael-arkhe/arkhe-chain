//! Tip-extending chain state for Arkhe.
//!
//! Admission is [`ArkheNode::ingest`]. The transaction payload is the
//! canonical CBOR of [`arkhe_core::decision::DecisionVerdict`]
//! (`AKG:VERDICT:v1`): one map whose keys are `version`, `subject`,
//! `event_type`, `policy_id`, `policy_digest`, `rule_id`, `decision`
//! (`ALLOW` or `REJECT`), and `reason` (`RULE_ALLOWED`, `RULE_REJECTED`,
//! `NO_RULE_MATCHED`, `POLICY_UNAVAILABLE`, or `EMERGENCY_STOP`). Only
//! `RULE_ALLOWED` is an allow. The verdict `subject` must equal
//! [`Transaction::subject`]. A 3,309-byte `signature_mldsa` is an ML-DSA-65
//! signature over the transaction fields, checked with the account's ML-DSA
//! public key. An empty field is rejected and does not move a balance. The
//! sender must also present an Ed25519 signature over the transaction subject.
//! A missing or invalid sender signature does not move a balance. This crate has no `ArkheChain` type and no
//! `ingest_transaction` function.
//!
//! Balances move only through checked debits and credits. The MMR root is
//! `arkhe_verify_core::rbb::mmr::Frontier`. Settlement asks
//! `UndeployedVerifier`, which returns `VerifierAbsent`. It does not run a
//! pairing.

mod anchor;
mod codec;
mod contingency;
mod error;
mod ethereum;
mod halt;
mod p2p;
mod persist;
mod proof_verification;
mod replay_log;
mod state;
mod tx;
mod validity;
mod validity_bridge;

pub use anchor::{btc_op_return, check_btc_op_return, AnchorPlan, AnchorPublisher, BTC_OP_RETURN_LEN};
pub use codec::{decode_block, encode_block};
pub use contingency::{hold_for_absent_verifier, SettlementContingency};
pub use error::ChainError;
pub use ethereum::{
    ethereum_link, ethereum_link_commitment, ethereum_link_preimage, AbsentExecutionRpc,
    EthereumExecutionId, EthereumLink, ExecutionRpc, ETH_LINK_DOMAIN,
};
pub use halt::load_emergency_halt;
pub use p2p::{spawn_server, sync_canonical, SyncServer, SYNC_PROTOCOL};
pub use proof_verification::{
    check_shape, Groth16Verifier, RejectingVerifier, UndeployedVerifier, PHASE0_SELECTOR, SEAL_LEN,
};
pub use replay_log::{format_replay, parse_replay, ReplayRecord};
pub use state::{apply_transfer, ChainState, GENESIS_ACCOUNT, GENESIS_SUPPLY};
pub use tx::{
    mldsa_message, sign_mldsa, Block, BlockHeader, Transaction, MLDSA65_CONTEXT, MLDSA65_PK_LEN,
    MLDSA65_SIG_LEN,
};
pub use validity::{load_circuit, read_journal, ProofJournal, ValidityCircuit};
pub use validity_bridge::{AbsentRpc, RpcOutcome, SettleRequest, SettlementRpc, ValidityBridge};

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use libp2p::identity::ed25519;

const MAX_TX_PER_BLOCK: usize = 250;
const MEMPOOL_CAPACITY: usize = 1000;

struct Inner {
    mempool: VecDeque<Transaction>,
    state: ChainState,
    blocks: HashMap<[u8; 32], Vec<u8>>,
    by_height: BTreeMap<u64, [u8; 32]>,
    emergency_halt: bool,
    last_replay: Option<ReplayRecord>,
    contingency: Option<SettlementContingency>,
    sync_resume: Option<p2p::SyncResume>,
    forks: Vec<[u8; 32]>,
    fork_blocks: Vec<Vec<u8>>,
    precommits: BTreeMap<(u64, String), StoredPrecommit>,
    ethereum_links: BTreeMap<u64, EthereumExecutionId>,
}

/// Local finality by depth. This is not a CometBFT commit: a round here is
/// only an integer bound into the precommit, and there is no `CanonicalVote`.
/// `depth` is the number of canonical blocks above `height`; the tip has depth 0.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Finality {
    pub height: u64,
    pub depth: u64,
}

#[derive(Clone)]
pub struct Account {
    pub id: String,
    pub public_key: [u8; 32],
    pub mldsa_public_key: Option<[u8; MLDSA65_PK_LEN]>,
}

pub struct ArkheNode {
    node_id: String,
    signer: ed25519::Keypair,
    validators: BTreeMap<String, ed25519::PublicKey>,
    inner: Mutex<Inner>,
    store: Mutex<Option<PathBuf>>,
}

/// A validator id bound to an Ed25519 public key. This is not an ML-DSA key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Validator {
    pub id: String,
    pub public_key: [u8; 32],
}

/// One validator the node will dial. This is not a discovered network peer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AcceptedPeer {
    pub validator_id: String,
    pub peer_id: libp2p::PeerId,
}

/// A local Ed25519 attestation. This is not a CometBFT `CanonicalVote`.
/// [`precommit_message`] binds `AKG:CHAIN:PRECOMMIT:v2`, the height, the round,
/// and the block hash. There is no part set. Each configured validator has
/// weight 1. One validator keeps a single vote per height: a later round for
/// the same hash replaces it, and an earlier round is refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Precommit {
    pub validator_id: String,
    pub height: u64,
    pub round: u64,
    pub block_hash: [u8; 32],
    pub signature: [u8; 64],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct StoredPrecommit {
    pub(crate) round: u64,
    pub(crate) block_hash: [u8; 32],
    pub(crate) signature: [u8; 64],
    pub(crate) historical_v1: bool,
}

#[derive(Debug)]
pub struct Proposal {
    pub block: Option<Block>,
    pub rejected: Vec<ChainError>,
}

impl ArkheNode {
    pub fn new(
        node_id: &str,
        secret_key: &[u8; 32],
        validators: Vec<Validator>,
        accounts: Vec<Account>,
    ) -> Result<Self, ChainError> {
        if !tx::account_id(node_id) {
            return Err(ChainError::BadAccount);
        }
        let validators = parse_validators(validators)?;
        let signer = signer_from(secret_key)?;
        match validators.get(node_id) {
            Some(public) if public == &signer.public() => {}
            Some(_) => return Err(ChainError::BadProposerKey),
            None => return Err(ChainError::NotProposer),
        }
        let mut state = ChainState::genesis();
        let parsed = parse_accounts(accounts)?;
        state.set_account_keys(parsed.ed25519, parsed.mldsa)?;
        Ok(Self {
            node_id: node_id.to_string(),
            signer,
            validators,
            inner: Mutex::new(Inner {
                mempool: VecDeque::with_capacity(MEMPOOL_CAPACITY),
                state,
                blocks: HashMap::new(),
                by_height: BTreeMap::new(),
                emergency_halt: false,
                last_replay: None,
                contingency: None,
                sync_resume: None,
                forks: Vec::new(),
                fork_blocks: Vec::new(),
                precommits: BTreeMap::new(),
                ethereum_links: BTreeMap::new(),
            }),
            store: Mutex::new(None),
        })
    }

    /// Open a chain file. A missing file starts at genesis and is created.
    /// An existing file is replayed from genesis and refused when the stored
    /// accounts, nonces, account keys, tip, MMR peaks, recorded forks,
    /// precommits, or execution citations differ from that replay. A recorded
    /// fork is imported again
    /// and must come back as `Fork`. A stored precommit is checked again and
    /// does not commit the height. Neither replaces the canonical tip.
    pub fn open(
        path: impl AsRef<Path>,
        node_id: &str,
        secret_key: &[u8; 32],
        validators: Vec<Validator>,
        accounts: Vec<Account>,
    ) -> Result<Self, ChainError> {
        let path = path.as_ref().to_path_buf();
        let node = Self::new(node_id, secret_key, validators, accounts)?;
        if path.exists() {
            let bytes = std::fs::read(&path).map_err(|_| ChainError::Snapshot)?;
            let snap = persist::decode_snapshot(&bytes)?;
            for block in &snap.blocks {
                node.import_block(block)?;
            }
            let inner = node.lock()?;
            if inner.state.height != snap.height
                || inner.state.tip != snap.tip
                || inner.state.frontier.count != snap.mmr_count
                || inner.state.frontier.peaks != snap.peaks
                || inner.state.balance_map() != &snap.balances
                || inner.state.nonce_map() != &snap.nonces
                || inner.state.account_keys() != &snap.ed25519
                || inner.state.account_mldsa() != &snap.mldsa
            {
                return Err(ChainError::Snapshot);
            }
            drop(inner);
            for fork in &snap.forks {
                if !matches!(node.import_block(fork), Err(ChainError::Fork)) {
                    return Err(ChainError::Snapshot);
                }
            }
            let inner = node.lock()?;
            let recorded = snap
                .forks
                .iter()
                .map(|bytes| tx::block_hash(bytes))
                .collect::<Vec<_>>();
            if inner.forks != recorded || inner.fork_blocks != snap.forks {
                return Err(ChainError::Snapshot);
            }
            drop(inner);
            for decoded in &snap.precommits {
                if node
                    .store_precommit(&decoded.vote, decoded.historical_v1)
                    .is_err()
                {
                    return Err(ChainError::Snapshot);
                }
            }
            let inner = node.lock()?;
            let recorded = snap
                .precommits
                .iter()
                .map(|decoded| {
                    (
                        (decoded.vote.height, decoded.vote.validator_id.clone()),
                        StoredPrecommit {
                            round: decoded.vote.round,
                            block_hash: decoded.vote.block_hash,
                            signature: decoded.vote.signature,
                            historical_v1: decoded.historical_v1,
                        },
                    )
                })
                .collect::<BTreeMap<_, _>>();
            if inner.precommits != recorded || snap.precommits.len() != recorded.len() {
                return Err(ChainError::Snapshot);
            }
            drop(inner);
            for (height, execution) in &snap.ethereum_links {
                node.cite_ethereum_execution(*height, *execution)
                    .map_err(|_| ChainError::Snapshot)?;
            }
            if node.lock()?.ethereum_links != snap.ethereum_links {
                return Err(ChainError::Snapshot);
            }
            for tx in snap.mempool {
                node.ingest(tx)?;
            }
        }
        node.checkpoint_to(&path)?;
        *node.store.lock().map_err(|_| ChainError::LockPoisoned)? = Some(path);
        Ok(node)
    }

    pub fn node_id(&self) -> &str {
        &self.node_id
    }

    /// Libp2p peer id of this validator's Ed25519 key. Sync listens as this id.
    pub fn peer_id(&self) -> libp2p::PeerId {
        validator_peer_id(&self.signer.public())
    }

    /// Validators this node can sync from. There is no discovery: the list is
    /// exactly the Ed25519 keys passed to `new` or `open`, in validator-id order.
    pub fn accepted_peers(&self) -> Vec<AcceptedPeer> {
        self.validators
            .iter()
            .map(|(validator_id, public)| AcceptedPeer {
                validator_id: validator_id.clone(),
                peer_id: validator_peer_id(public),
            })
            .collect()
    }

    pub(crate) fn network_keypair(&self) -> libp2p::identity::Keypair {
        libp2p::identity::Keypair::from(self.signer.clone())
    }

    pub(crate) fn accepts_peer(&self, peer: &libp2p::PeerId) -> bool {
        self.accepted_peers().iter().any(|accepted| &accepted.peer_id == peer)
    }

    pub fn emergency_halt(&self) -> Result<bool, ChainError> {
        Ok(self.lock()?.emergency_halt)
    }

    /// Apply a properties document. A document that does not parse leaves the
    /// node halted.
    pub fn apply_emergency_halt(&self, text: &str) -> Result<bool, ChainError> {
        match load_emergency_halt(text) {
            Ok(halt) => {
                self.lock()?.emergency_halt = halt;
                Ok(halt)
            }
            Err(error) => {
                if let Ok(mut inner) = self.lock() {
                    inner.emergency_halt = true;
                }
                Err(error)
            }
        }
    }

    pub fn last_replay(&self) -> Result<Option<ReplayRecord>, ChainError> {
        Ok(self.lock()?.last_replay.clone())
    }

    pub fn ingest(&self, tx: Transaction) -> Result<(), ChainError> {
        let path = self.store_path()?;
        let mut inner = self.lock()?;
        if inner.emergency_halt {
            return Err(ChainError::EmergencyHalt);
        }
        let mut trial = inner.state.clone();
        for queued in inner
            .mempool
            .iter()
            .filter(|queued| queued.sender == tx.sender)
        {
            trial.apply_tx(queued)?;
        }
        trial.apply_tx(&tx)?;
        if inner.mempool.len() >= MEMPOOL_CAPACITY {
            return Err(ChainError::MempoolFull);
        }
        inner.mempool.push_back(tx);
        if let Some(path) = path.as_deref() {
            let written = persist::encode_snapshot(
                &inner.state,
                &inner.by_height,
                &inner.blocks,
                &inner.mempool,
                &inner.fork_blocks,
                &inner.precommits,
                &inner.ethereum_links,
            )
            .and_then(|encoded| persist::write_atomic(path, &encoded));
            if let Err(error) = written {
                inner.mempool.pop_back();
                return Err(error);
            }
        }
        Ok(())
    }

    pub fn mempool_len(&self) -> Result<usize, ChainError> {
        Ok(self.lock()?.mempool.len())
    }

    pub fn balance(&self, account: &str) -> Result<u64, ChainError> {
        Ok(self.lock()?.state.balance(account))
    }

    pub fn supply(&self) -> Result<u64, ChainError> {
        self.lock()?.state.supply()
    }

    pub fn fork_count(&self) -> Result<usize, ChainError> {
        Ok(self.lock()?.forks.len())
    }

    pub fn height(&self) -> Result<u64, ChainError> {
        Ok(self.lock()?.state.height)
    }

    pub fn tip(&self) -> Result<[u8; 32], ChainError> {
        Ok(self.lock()?.state.tip)
    }

    pub fn mmr_root(&self) -> Result<[u8; 32], ChainError> {
        self.lock()?.state.mmr_root()
    }

    pub fn mmr_count(&self) -> Result<u64, ChainError> {
        Ok(self.lock()?.state.frontier.count)
    }

    pub fn finality(&self, height: u64) -> Result<Finality, ChainError> {
        let inner = self.lock()?;
        if !inner.by_height.contains_key(&height) {
            return Err(ChainError::UnknownBlock);
        }
        let depth = inner
            .state
            .height
            .checked_sub(height)
            .ok_or(ChainError::UnknownBlock)?;
        Ok(Finality { height, depth })
    }

    /// Store one verified local precommit. The signature must bind the round.
    /// The tip does not move. `bft_commit` counts only the highest stored
    /// round, and only when that round exceeds two thirds of the validators.
    pub fn note_precommit(&self, vote: &Precommit) -> Result<(), ChainError> {
        self.store_precommit(vote, false)
    }

    fn store_precommit(&self, vote: &Precommit, historical_v1: bool) -> Result<(), ChainError> {
        let Some(public) = self.validators.get(&vote.validator_id) else {
            return Err(ChainError::NotProposer);
        };
        let message = if historical_v1 {
            if vote.round != 0 {
                return Err(ChainError::BadProposerSignature);
            }
            historical_precommit_message(vote.height, &vote.block_hash)
        } else {
            precommit_message(vote.height, vote.round, &vote.block_hash)
        };
        if !public.verify(&message, &vote.signature) {
            return Err(ChainError::BadProposerSignature);
        }
        let path = self.store_path()?;
        let mut inner = self.lock()?;
        let canonical = inner
            .by_height
            .get(&vote.height)
            .copied()
            .ok_or(ChainError::UnknownBlock)?;
        if vote.block_hash != canonical {
            if inner.forks.contains(&vote.block_hash) {
                return Err(ChainError::Fork);
            }
            return Err(ChainError::UnknownBlock);
        }
        let key = (vote.height, vote.validator_id.clone());
        let previous = inner.precommits.get(&key).cloned();
        if let Some(stored) = &previous {
            if stored.block_hash != vote.block_hash {
                return Err(ChainError::Equivocation);
            }
            if vote.round < stored.round {
                return Err(ChainError::RoundRegression);
            }
            if vote.round == stored.round {
                return Ok(());
            }
        }
        inner.precommits.insert(
            key.clone(),
            StoredPrecommit {
                round: vote.round,
                block_hash: vote.block_hash,
                signature: vote.signature,
                historical_v1,
            },
        );
        if let Some(path) = path.as_deref() {
            let written = persist::encode_snapshot(
                &inner.state,
                &inner.by_height,
                &inner.blocks,
                &inner.mempool,
                &inner.fork_blocks,
                &inner.precommits,
                &inner.ethereum_links,
            )
            .and_then(|encoded| persist::write_atomic(path, &encoded));
            if let Err(error) = written {
                match previous {
                    Some(stored) => {
                        inner.precommits.insert(key, stored);
                    }
                    None => {
                        inner.precommits.remove(&key);
                    }
                }
                return Err(error);
            }
        }
        Ok(())
    }

    pub fn precommit_count(&self, height: u64) -> Result<usize, ChainError> {
        let inner = self.lock()?;
        if !inner.by_height.contains_key(&height) {
            return Err(ChainError::UnknownBlock);
        }
        Ok(inner
            .precommits
            .iter()
            .filter(|((stored_height, _), _)| *stored_height == height)
            .count())
    }

    /// Round stored for this validator at `height`. `Ok(None)` means no vote.
    pub fn precommit_round(&self, height: u64, validator_id: &str) -> Result<Option<u64>, ChainError> {
        let inner = self.lock()?;
        if !inner.by_height.contains_key(&height) {
            return Err(ChainError::UnknownBlock);
        }
        Ok(inner
            .precommits
            .get(&(height, validator_id.to_string()))
            .map(|stored| stored.round))
    }

    /// Accept the height when the highest round on its canonical hash exceeds
    /// two thirds of the configured validators. Each validator has weight 1.
    /// Earlier rounds do not add. There is no `CanonicalVote`. The tip does not move.
    pub fn bft_commit(&self, height: u64) -> Result<(), ChainError> {
        let inner = self.lock()?;
        let canonical = inner
            .by_height
            .get(&height)
            .copied()
            .ok_or(ChainError::UnknownBlock)?;
        let rounds: Vec<u64> = inner
            .precommits
            .iter()
            .filter_map(|((stored_height, _), stored)| {
                if *stored_height == height && stored.block_hash == canonical {
                    Some(stored.round)
                } else {
                    None
                }
            })
            .collect();
        let Some(top) = rounds.iter().copied().max() else {
            return Err(ChainError::QuorumAbsent);
        };
        let votes = rounds.iter().filter(|round| **round == top).count();
        let validators = self.validators.len();
        if validators == 0 || votes.saturating_mul(3) <= validators.saturating_mul(2) {
            return Err(ChainError::QuorumAbsent);
        }
        Ok(())
    }

    pub fn encoded_block(&self, hash: &[u8; 32]) -> Result<Option<Vec<u8>>, ChainError> {
        Ok(self.lock()?.blocks.get(hash).cloned())
    }

    /// Canonical successor of `parent`. The all-zero parent is the genesis tip,
    /// whose successor is block 1. A parent outside this chain has no child.
    pub fn canonical_child(&self, parent: &[u8; 32]) -> Result<Option<Vec<u8>>, ChainError> {
        let inner = self.lock()?;
        let next_height = if *parent == [0u8; 32] {
            1
        } else {
            match inner.by_height.iter().find(|(_, hash)| *hash == parent) {
                Some((height, _)) => height.checked_add(1).ok_or(ChainError::Overflow)?,
                None => return Ok(None),
            }
        };
        let Some(hash) = inner.by_height.get(&next_height).copied() else {
            return Ok(None);
        };
        let bytes = inner
            .blocks
            .get(&hash)
            .ok_or(ChainError::UnknownBlock)?
            .clone();
        if decode_block(&bytes)?.header.parent_hash != *parent {
            return Err(ChainError::ParentMismatch);
        }
        Ok(Some(bytes))
    }

    pub fn header_at(&self, height: u64) -> Result<BlockHeader, ChainError> {
        let inner = self.lock()?;
        let hash = inner
            .by_height
            .get(&height)
            .copied()
            .ok_or(ChainError::UnknownBlock)?;
        let bytes = inner.blocks.get(&hash).ok_or(ChainError::UnknownBlock)?;
        Ok(decode_block(bytes)?.header)
    }

    /// Cite one Ethereum execution block from a sealed Arkhe block.
    ///
    /// The execution number and hash are taken from the caller. This method
    /// does not dial Ethereum and does not settle. `settled` is false. One
    /// height keeps one citation. A second execution number or hash at that
    /// height, or a number that does not advance with height, is
    /// [`ChainError::EthereumConflict`]. A zero execution number or an
    /// all-zero execution hash is [`ChainError::EthereumHeader`].
    pub fn cite_ethereum_execution(
        &self,
        height: u64,
        execution: EthereumExecutionId,
    ) -> Result<EthereumLink, ChainError> {
        if execution.number == 0 || execution.hash == [0u8; 32] {
            return Err(ChainError::EthereumHeader);
        }
        let path = self.store_path()?;
        let mut inner = self.lock()?;
        let arkhe_block_hash = inner
            .by_height
            .get(&height)
            .copied()
            .ok_or(ChainError::UnknownBlock)?;
        let bytes = inner
            .blocks
            .get(&arkhe_block_hash)
            .ok_or(ChainError::UnknownBlock)?;
        let header = decode_block(bytes)?.header;
        if header.block_number != height {
            return Err(ChainError::StateMismatch);
        }
        if let Some(stored) = inner.ethereum_links.get(&height).copied() {
            if stored == execution {
                return Ok(ethereum_link(&header, arkhe_block_hash, execution));
            }
            return Err(ChainError::EthereumConflict);
        }
        if inner.ethereum_links.values().any(|stored| {
            stored.number == execution.number || stored.hash == execution.hash
        }) || inner.ethereum_links.iter().any(|(stored_height, stored)| {
            (*stored_height < height && stored.number >= execution.number)
                || (*stored_height > height && stored.number <= execution.number)
        }) {
            return Err(ChainError::EthereumConflict);
        }
        inner.ethereum_links.insert(height, execution);
        if let Some(path) = path.as_deref() {
            let written = persist::encode_snapshot(
                &inner.state,
                &inner.by_height,
                &inner.blocks,
                &inner.mempool,
                &inner.fork_blocks,
                &inner.precommits,
                &inner.ethereum_links,
            )
            .and_then(|encoded| persist::write_atomic(path, &encoded));
            if let Err(error) = written {
                inner.ethereum_links.remove(&height);
                return Err(error);
            }
        }
        Ok(ethereum_link(&header, arkhe_block_hash, execution))
    }

    /// Ask an execution client whether the stored citation names that block.
    ///
    /// A missing client returns [`ChainError::RpcAbsent`]. A different hash
    /// returns [`ChainError::EthereumConflict`] and leaves the stored citation
    /// in place. The returned link has `confirmed` set and `settled` clear.
    /// Nothing is written: reopening the file does not keep the confirmation.
    pub fn confirm_ethereum_execution<R: ExecutionRpc>(
        &self,
        height: u64,
        rpc: &R,
    ) -> Result<EthereumLink, ChainError> {
        let Some(mut link) = self.ethereum_citation(height)? else {
            return Err(ChainError::UnknownBlock);
        };
        let reported = rpc.execution_hash(link.execution_number)?;
        if reported == [0u8; 32] {
            return Err(ChainError::EthereumHeader);
        }
        if reported != link.execution_hash {
            return Err(ChainError::EthereumConflict);
        }
        link.confirmed = true;
        link.settled = false;
        Ok(link)
    }

    /// Stored citation for `height`. `None` means this chain has not cited one.
    /// `confirmed` is false: the file does not record a client check.
    pub fn ethereum_citation(&self, height: u64) -> Result<Option<EthereumLink>, ChainError> {
        let inner = self.lock()?;
        let Some(execution) = inner.ethereum_links.get(&height).copied() else {
            return Ok(None);
        };
        let arkhe_block_hash = inner
            .by_height
            .get(&height)
            .copied()
            .ok_or(ChainError::UnknownBlock)?;
        let bytes = inner
            .blocks
            .get(&arkhe_block_hash)
            .ok_or(ChainError::UnknownBlock)?;
        let header = decode_block(bytes)?.header;
        Ok(Some(ethereum_link(&header, arkhe_block_hash, execution)))
    }

    /// Seal a block from the mempool. The block extends this node's tip by one.
    /// The timestamp must be nonzero and later than the parent header. A
    /// transaction that fails while the block is built is left out of the
    /// block and reported in `rejected`. Balances change only for transactions
    /// inside the sealed block.
    pub fn propose_and_seal_block(&self, timestamp: u64) -> Result<Proposal, ChainError> {
        if !self.validators.contains_key(&self.node_id) {
            return Err(ChainError::NotProposer);
        }
        let path = self.store_path()?;
        let mut inner = self.lock()?;
        if inner.emergency_halt {
            return Err(ChainError::EmergencyHalt);
        }
        accept_timestamp(&inner, timestamp)?;
        if inner.mempool.is_empty() {
            return Err(ChainError::MempoolEmpty);
        }
        let saved_mempool = inner.mempool.clone();
        let mut batch = Vec::new();
        while batch.len() < MAX_TX_PER_BLOCK {
            match inner.mempool.pop_front() {
                Some(tx) => batch.push(tx),
                None => break,
            }
        }
        let mut working = inner.state.clone();
        let mut accepted = Vec::new();
        let mut rejected = Vec::new();
        for tx in batch {
            match working.apply_tx(&tx) {
                Ok(()) => accepted.push(tx),
                Err(error) => rejected.push(error),
            }
        }
        if accepted.is_empty() {
            return Ok(Proposal {
                block: None,
                rejected,
            });
        }
        let header = BlockHeader {
            block_number: working.height + 1,
            parent_hash: working.tip,
            state_root: working.state_commitment()?,
            mmr_count: working.frontier.count,
            timestamp,
            proposer: self.node_id.clone(),
            proposer_signature: [0u8; 64],
        };
        let mut block = Block {
            header,
            transactions: accepted,
        };
        sign_block(&mut block, &self.signer)?;
        let bytes = encode_block(&block);
        let hash = tx::block_hash(&bytes);
        working.height += 1;
        working.tip = hash;
        if let Err(error) = commit_extension(path.as_deref(), &mut inner, working, hash, bytes) {
            inner.mempool = saved_mempool;
            return Err(error);
        }
        Ok(Proposal {
            block: Some(block),
            rejected,
        })
    }

    /// Adopt `bytes` only when it extends the current tip by one height and
    /// every transaction replays to the header root.
    pub fn import_block(&self, bytes: &[u8]) -> Result<[u8; 32], ChainError> {
        let started = std::time::Instant::now();
        let result = self.import_block_inner(bytes);
        let (height, tx_count) = decode_block(bytes)
            .map(|block| (block.header.block_number, block.transactions.len() as u64))
            .unwrap_or((0, 0));
        let record = ReplayRecord {
            height,
            tx_count,
            elapsed_ns: u64::try_from(started.elapsed().as_nanos()).unwrap_or(u64::MAX),
            adopted: result.is_ok(),
            error: result.as_ref().err().map(ToString::to_string),
        };
        if let Ok(mut inner) = self.lock() {
            inner.last_replay = Some(record);
        }
        result
    }

    fn import_block_inner(&self, bytes: &[u8]) -> Result<[u8; 32], ChainError> {
        if bytes.len() > 2 * 1024 * 1024 {
            return Err(ChainError::Malformed);
        }
        let block = decode_block(bytes)?;
        if encode_block(&block) != bytes {
            return Err(ChainError::Malformed);
        }
        let Some(public) = self.validators.get(&block.header.proposer) else {
            return Err(ChainError::NotProposer);
        };
        let message = codec::proposer_message(&block);
        if !public.verify(&message, &block.header.proposer_signature) {
            return Err(ChainError::BadProposerSignature);
        }
        let hash = tx::block_hash(bytes);
        let path = self.store_path()?;
        let mut inner = self.lock()?;
        if inner.emergency_halt {
            return Err(ChainError::EmergencyHalt);
        }
        if let Some(existing_hash) = inner.by_height.get(&block.header.block_number).copied() {
            if existing_hash != hash {
                let stored = inner
                    .blocks
                    .get(&existing_hash)
                    .ok_or(ChainError::UnknownBlock)?;
                let stored = decode_block(stored)?;
                if stored.header.proposer == block.header.proposer {
                    return Err(ChainError::Equivocation);
                }
                if stored.header.parent_hash == block.header.parent_hash {
                    let parent_height = block
                        .header
                        .block_number
                        .checked_sub(1)
                        .ok_or(ChainError::ParentMismatch)?;
                    reject_sibling(&inner, &block, parent_height)?;
                    if !inner.forks.contains(&hash) {
                        inner.forks.push(hash);
                        inner.fork_blocks.push(bytes.to_vec());
                        if let Some(path) = path.as_deref() {
                            let written = persist::encode_snapshot(
                                &inner.state,
                                &inner.by_height,
                                &inner.blocks,
                                &inner.mempool,
                                &inner.fork_blocks,
                                &inner.precommits,
                                &inner.ethereum_links,
                            )
                            .and_then(|encoded| persist::write_atomic(path, &encoded));
                            if let Err(error) = written {
                                inner.forks.pop();
                                inner.fork_blocks.pop();
                                return Err(error);
                            }
                        }
                    }
                    return Err(ChainError::Fork);
                }
            }
        }
        if block.header.parent_hash != inner.state.tip
            || block.header.block_number != inner.state.height + 1
        {
            return Err(ChainError::ParentMismatch);
        }
        accept_timestamp(&inner, block.header.timestamp)?;
        let mut working = inner.state.clone();
        for tx in &block.transactions {
            working.apply_tx(tx)?;
        }
        if working.state_commitment()? != block.header.state_root
            || working.frontier.count != block.header.mmr_count
        {
            return Err(ChainError::StateMismatch);
        }
        working.height = block.header.block_number;
        working.tip = hash;
        commit_extension(path.as_deref(), &mut inner, working, hash, bytes.to_vec())?;
        Ok(hash)
    }

    /// Bind a Phase 0 journal to a sealed header, then ask `UndeployedVerifier`.
    /// That verifier returns `VerifierAbsent`. A matching journal is not a
    /// Groth16 proof, and this method does not return success.
    pub fn submit_proof_and_bridge_assets(&self, proof: &[u8]) -> Result<(), ChainError> {
        let journal = read_journal(proof)?;
        let header = self.header_at(journal.target_block_number)?;
        if header.state_root != journal.claimed_root || header.parent_hash != journal.parent_hash {
            return Err(ChainError::ProofRejected);
        }
        let selector: [u8; 4] = proof
            .get(..4)
            .and_then(|bytes| bytes.try_into().ok())
            .ok_or(ChainError::ProofRejected)?;
        let seal = proof
            .get(proof.len().saturating_sub(SEAL_LEN)..)
            .ok_or(ChainError::ProofRejected)?;
        match UndeployedVerifier.verify(selector, seal, &btc_op_return(&header.state_root)) {
            Err(ChainError::VerifierAbsent) => Err(ChainError::VerifierAbsent),
            Ok(_) => Err(ChainError::ProofRejected),
            Err(error) => Err(error),
        }
    }

    /// Record a settlement hold when the journal matches a sealed block and
    /// the Groth16 verifier is absent. A rejected proof does not open a hold.
    pub fn open_settlement_contingency(
        &self,
        proof: &[u8],
    ) -> Result<SettlementContingency, ChainError> {
        let journal = read_journal(proof)?;
        match self.submit_proof_and_bridge_assets(proof) {
            Err(ChainError::VerifierAbsent) => {}
            Err(error) => return Err(error),
            Ok(()) => return Err(ChainError::VerifierAbsent),
        }
        let hold = hold_for_absent_verifier(&journal)?;
        self.lock()?.contingency = Some(hold.clone());
        Ok(hold)
    }

    pub fn settlement_contingency(&self) -> Result<Option<SettlementContingency>, ChainError> {
        Ok(self.lock()?.contingency.clone())
    }

    /// Ask a transport to settle a bound journal. A receipt is stored only
    /// when the verifier accepts the seal and the transport supplies the hash.
    pub fn relay_settlement<V: Groth16Verifier, R: SettlementRpc>(
        &self,
        proof: &[u8],
        bridge: &ValidityBridge,
        verifier: &V,
        rpc: &R,
    ) -> Result<[u8; 32], ChainError> {
        let journal = read_journal(proof)?;
        let header = self.header_at(journal.target_block_number)?;
        if header.state_root != journal.claimed_root || header.parent_hash != journal.parent_hash {
            return Err(ChainError::ProofRejected);
        }
        let selector: [u8; 4] = proof
            .get(..4)
            .ok_or(ChainError::ProofRejected)?
            .try_into()
            .map_err(|_| ChainError::ProofRejected)?;
        let seal = proof.get(76..336).ok_or(ChainError::ProofRejected)?;
        match bridge.submit_validity_proof(
            journal.target_block_number,
            &journal.claimed_root,
            selector,
            seal,
            verifier,
            rpc,
        ) {
            Ok(tx_hash) => {
                let mut hold = hold_for_absent_verifier(&journal)?;
                hold.settled = true;
                hold.receipt = Some(tx_hash);
                self.lock()?.contingency = Some(hold);
                Ok(tx_hash)
            }
            Err(error) => {
                if matches!(
                    error,
                    ChainError::VerifierAbsent
                        | ChainError::RpcAbsent
                        | ChainError::RpcTimeout
                        | ChainError::RpcUnavailable
                ) {
                    let hold = hold_for_absent_verifier(&journal)?;
                    let mut inner = self.lock()?;
                    let replace = inner
                        .contingency
                        .as_ref()
                        .map(|current| !current.settled)
                        .unwrap_or(true);
                    if replace {
                        inner.contingency = Some(hold);
                    }
                }
                Err(error)
            }
        }
    }

    fn store_path(&self) -> Result<Option<std::path::PathBuf>, ChainError> {
        Ok(self
            .store
            .lock()
            .map_err(|_| ChainError::LockPoisoned)?
            .clone())
    }

    fn checkpoint_to(&self, path: &Path) -> Result<(), ChainError> {
        let inner = self.lock()?;
        let bytes = persist::encode_snapshot(
            &inner.state,
            &inner.by_height,
            &inner.blocks,
            &inner.mempool,
            &inner.fork_blocks,
            &inner.precommits,
            &inner.ethereum_links,
        )?;
        drop(inner);
        persist::write_atomic(path, &bytes)
    }

    pub(crate) fn load_sync_resume(
        &self,
        remote_tip: [u8; 32],
    ) -> Result<Option<p2p::SyncResume>, ChainError> {
        Ok(self
            .lock()?
            .sync_resume
            .clone()
            .filter(|resume| resume.remote_tip == remote_tip))
    }

    pub(crate) fn store_sync_resume(&self, resume: p2p::SyncResume) -> Result<(), ChainError> {
        self.lock()?.sync_resume = Some(resume);
        Ok(())
    }

    pub(crate) fn clear_sync_resume(&self) -> Result<(), ChainError> {
        self.lock()?.sync_resume = None;
        Ok(())
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Inner>, ChainError> {
        self.inner.lock().map_err(|_| ChainError::LockPoisoned)
    }
}

fn reject_sibling(inner: &Inner, block: &Block, parent_height: u64) -> Result<(), ChainError> {
    if block.header.timestamp == 0 {
        return Err(ChainError::BadTimestamp);
    }
    let mut trial = ChainState::genesis();
    trial.set_account_keys(
        inner.state.account_keys().clone(),
        inner.state.account_mldsa().clone(),
    )?;
    for height in 1..=parent_height {
        let hash = inner
            .by_height
            .get(&height)
            .copied()
            .ok_or(ChainError::UnknownBlock)?;
        let bytes = inner.blocks.get(&hash).ok_or(ChainError::UnknownBlock)?;
        let parent = decode_block(bytes)?;
        if parent.header.parent_hash != trial.tip || parent.header.block_number != trial.height + 1 {
            return Err(ChainError::ParentMismatch);
        }
        for tx in &parent.transactions {
            trial.apply_tx(tx)?;
        }
        if height == parent_height && block.header.timestamp <= parent.header.timestamp {
            return Err(ChainError::BadTimestamp);
        }
        trial.height = parent.header.block_number;
        trial.tip = hash;
    }
    if trial.tip != block.header.parent_hash {
        return Err(ChainError::ParentMismatch);
    }
    for tx in &block.transactions {
        trial.apply_tx(tx)?;
    }
    if trial.state_commitment()? != block.header.state_root
        || trial.frontier.count != block.header.mmr_count
    {
        return Err(ChainError::StateMismatch);
    }
    Ok(())
}

fn commit_extension(
    path: Option<&Path>,
    inner: &mut Inner,
    working: ChainState,
    hash: [u8; 32],
    bytes: Vec<u8>,
) -> Result<(), ChainError> {
    inner.blocks.insert(hash, bytes);
    inner.by_height.insert(working.height, hash);
    let mut mempool = inner.mempool.clone();
    retain_applicable(&working, &mut mempool);
    if let Some(path) = path {
        let written = persist::encode_snapshot(
            &working,
            &inner.by_height,
            &inner.blocks,
            &mempool,
            &inner.fork_blocks,
            &inner.precommits,
            &inner.ethereum_links,
        )
            .and_then(|encoded| persist::write_atomic(path, &encoded));
        if let Err(error) = written {
            inner.blocks.remove(&hash);
            inner.by_height.remove(&working.height);
            return Err(error);
        }
    }
    inner.mempool = mempool;
    inner.state = working;
    Ok(())
}

fn retain_applicable(state: &ChainState, mempool: &mut VecDeque<Transaction>) {
    let queued = std::mem::take(mempool);
    let mut trial = state.clone();
    for tx in queued {
        if trial.apply_tx(&tx).is_ok() {
            mempool.push_back(tx);
        }
    }
}

fn accept_timestamp(inner: &Inner, timestamp: u64) -> Result<(), ChainError> {
    if timestamp == 0 {
        return Err(ChainError::BadTimestamp);
    }
    if inner.state.height == 0 {
        return Ok(());
    }
    let hash = inner
        .by_height
        .get(&inner.state.height)
        .copied()
        .ok_or(ChainError::UnknownBlock)?;
    let bytes = inner.blocks.get(&hash).ok_or(ChainError::UnknownBlock)?;
    let parent = decode_block(bytes)?.header.timestamp;
    if timestamp <= parent {
        return Err(ChainError::BadTimestamp);
    }
    Ok(())
}

fn validator_peer_id(public: &ed25519::PublicKey) -> libp2p::PeerId {
    libp2p::identity::PublicKey::from(public.clone()).to_peer_id()
}

pub fn public_key(secret_key: &[u8; 32]) -> Result<[u8; 32], ChainError> {
    Ok(signer_from(secret_key)?.public().to_bytes())
}

pub fn sign_proposer(block: &mut Block, secret_key: &[u8; 32]) -> Result<(), ChainError> {
    sign_block(block, &signer_from(secret_key)?)
}

/// Signed preimage of a new precommit. The round is bound. This is not a
/// CometBFT `CanonicalVote`.
pub fn precommit_message(height: u64, round: u64, block_hash: &[u8; 32]) -> Vec<u8> {
    let mut message = b"AKG:CHAIN:PRECOMMIT:v2\0".to_vec();
    message.extend_from_slice(&height.to_be_bytes());
    message.extend_from_slice(&round.to_be_bytes());
    message.extend_from_slice(block_hash);
    message
}

/// Preimage of a precommit stored before rounds existed. It does not bind a
/// round. The node accepts it only while opening an `AKGCHNS5` or `AKGCHNS6`
/// file, and only as round 0.
pub fn historical_precommit_message(height: u64, block_hash: &[u8; 32]) -> Vec<u8> {
    let mut message = b"AKG:CHAIN:PRECOMMIT:v1\0".to_vec();
    message.extend_from_slice(&height.to_be_bytes());
    message.extend_from_slice(block_hash);
    message
}

pub fn sign_precommit(vote: &mut Precommit, secret_key: &[u8; 32]) -> Result<(), ChainError> {
    let signer = signer_from(secret_key)?;
    let signature = signer.sign(&precommit_message(vote.height, vote.round, &vote.block_hash));
    vote.signature = signature
        .as_slice()
        .try_into()
        .map_err(|_| ChainError::BadProposerSignature)?;
    Ok(())
}

pub fn sign_historical_precommit(vote: &mut Precommit, secret_key: &[u8; 32]) -> Result<(), ChainError> {
    if vote.round != 0 {
        return Err(ChainError::BadProposerSignature);
    }
    let signer = signer_from(secret_key)?;
    let signature = signer.sign(&historical_precommit_message(vote.height, &vote.block_hash));
    vote.signature = signature
        .as_slice()
        .try_into()
        .map_err(|_| ChainError::BadProposerSignature)?;
    Ok(())
}

pub fn sign_sender(tx: &mut Transaction, secret_key: &[u8; 32]) -> Result<(), ChainError> {
    let signer = signer_from(secret_key)?;
    let signature = signer.sign(&tx::sender_message(tx));
    tx.sender_signature = signature
        .as_slice()
        .try_into()
        .map_err(|_| ChainError::UnverifiedSignature)?;
    Ok(())
}

fn signer_from(secret_key: &[u8; 32]) -> Result<ed25519::Keypair, ChainError> {
    let mut bytes = *secret_key;
    let secret = ed25519::SecretKey::try_from_bytes(&mut bytes).map_err(|_| ChainError::BadProposerKey)?;
    Ok(ed25519::Keypair::from(secret))
}

fn sign_block(block: &mut Block, signer: &ed25519::Keypair) -> Result<(), ChainError> {
    let signature = signer.sign(&codec::proposer_message(block));
    block.header.proposer_signature = signature
        .as_slice()
        .try_into()
        .map_err(|_| ChainError::BadProposerSignature)?;
    Ok(())
}

struct ParsedAccounts {
    ed25519: BTreeMap<String, [u8; 32]>,
    mldsa: BTreeMap<String, [u8; MLDSA65_PK_LEN]>,
}

fn parse_accounts(accounts: Vec<Account>) -> Result<ParsedAccounts, ChainError> {
    let mut ed25519 = BTreeMap::new();
    let mut mldsa = BTreeMap::new();
    for account in accounts {
        if !tx::account_id(&account.id) {
            return Err(ChainError::BadAccount);
        }
        ed25519::PublicKey::try_from_bytes(&account.public_key)
            .map_err(|_| ChainError::UnverifiedSignature)?;
        if let Some(public) = account.mldsa_public_key {
            tx::decode_mldsa_public(&public)?;
            if mldsa.insert(account.id.clone(), public).is_some() {
                return Err(ChainError::BadAccount);
            }
        }
        if ed25519.insert(account.id, account.public_key).is_some() {
            return Err(ChainError::BadAccount);
        }
    }
    Ok(ParsedAccounts { ed25519, mldsa })
}

fn parse_validators(
    validators: Vec<Validator>,
) -> Result<BTreeMap<String, ed25519::PublicKey>, ChainError> {
    if validators.is_empty() {
        return Err(ChainError::EmptyValidators);
    }
    let mut parsed = BTreeMap::new();
    for validator in validators {
        if !tx::account_id(&validator.id) {
            return Err(ChainError::BadAccount);
        }
        let public = ed25519::PublicKey::try_from_bytes(&validator.public_key)
            .map_err(|_| ChainError::BadProposerKey)?;
        if parsed.insert(validator.id, public).is_some() {
            return Err(ChainError::BadAccount);
        }
    }
    Ok(parsed)
}

pub type SharedNode = Arc<ArkheNode>;
