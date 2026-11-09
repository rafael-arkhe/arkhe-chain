use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::Path;

use crate::codec::{decode_tx, encode_tx};
use crate::error::ChainError;
use crate::ethereum::EthereumExecutionId;
use crate::state::ChainState;
use crate::tx::{account_id, Transaction, MLDSA65_PK_LEN};

const MAGIC_V5: &[u8; 8] = b"AKGCHNS5";
const MAGIC_V6: &[u8; 8] = b"AKGCHNS6";
const MAGIC_V7: &[u8; 8] = b"AKGCHNS7";
const MAX_SNAPSHOT: usize = 64 * 1024 * 1024;
const MAX_MEMPOOL: usize = 1000;

pub(crate) struct Snapshot {
    pub(crate) height: u64,
    pub(crate) tip: [u8; 32],
    pub(crate) mmr_count: u64,
    pub(crate) peaks: Vec<[u8; 32]>,
    pub(crate) balances: BTreeMap<String, u64>,
    pub(crate) nonces: BTreeMap<String, u64>,
    pub(crate) blocks: Vec<Vec<u8>>,
    pub(crate) mempool: Vec<Transaction>,
    pub(crate) ed25519: BTreeMap<String, [u8; 32]>,
    pub(crate) mldsa: BTreeMap<String, [u8; MLDSA65_PK_LEN]>,
    pub(crate) forks: Vec<Vec<u8>>,
    pub(crate) precommits: Vec<DecodedPrecommit>,
    pub(crate) ethereum_links: BTreeMap<u64, EthereumExecutionId>,
}

pub(crate) struct DecodedPrecommit {
    pub(crate) vote: crate::Precommit,
    pub(crate) preimage: u8,
}

pub(crate) fn encode_snapshot(
    state: &ChainState,
    by_height: &BTreeMap<u64, [u8; 32]>,
    blocks: &HashMap<[u8; 32], Vec<u8>>,
    mempool: &VecDeque<Transaction>,
    forks: &[Vec<u8>],
    precommits: &BTreeMap<(u64, String), crate::StoredPrecommit>,
    ethereum_links: &BTreeMap<u64, EthereumExecutionId>,
) -> Result<Vec<u8>, ChainError> {
    if by_height.len() as u64 != state.height {
        return Err(ChainError::Snapshot);
    }
    if state.frontier.peaks.len() != state.frontier.count.count_ones() as usize {
        return Err(ChainError::Snapshot);
    }
    let mut ordered = Vec::with_capacity(state.height as usize);
    for height in 1..=state.height {
        let hash = by_height.get(&height).ok_or(ChainError::Snapshot)?;
        let bytes = blocks.get(hash).ok_or(ChainError::Snapshot)?;
        ordered.push(bytes.clone());
    }
    let mut out = Vec::new();
    out.extend_from_slice(MAGIC_V7);
    push_u64(&mut out, state.height);
    out.extend_from_slice(&state.tip);
    push_u64(&mut out, state.frontier.count);
    push_u32(&mut out, state.frontier.peaks.len() as u32);
    for peak in &state.frontier.peaks {
        out.extend_from_slice(peak);
    }
    write_accounts(&mut out, state.balance_map())?;
    write_accounts(&mut out, state.nonce_map())?;
    push_u32(&mut out, ordered.len() as u32);
    for block in &ordered {
        push_u32(&mut out, block.len() as u32);
        out.extend_from_slice(block);
    }
    let queued = u32::try_from(mempool.len()).map_err(|_| ChainError::Snapshot)?;
    if mempool.len() > MAX_MEMPOOL {
        return Err(ChainError::Snapshot);
    }
    push_u32(&mut out, queued);
    for tx in mempool {
        let encoded = encode_tx(tx);
        push_u32(&mut out, encoded.len() as u32);
        out.extend_from_slice(&encoded);
    }
    write_keys(&mut out, state.account_keys())?;
    write_keys(&mut out, state.account_mldsa())?;
    let fork_count = u32::try_from(forks.len()).map_err(|_| ChainError::Snapshot)?;
    if forks.len() > 1_000 {
        return Err(ChainError::Snapshot);
    }
    push_u32(&mut out, fork_count);
    for fork in forks {
        let n = u32::try_from(fork.len()).map_err(|_| ChainError::Snapshot)?;
        if fork.is_empty() || fork.len() > 2 * 1024 * 1024 {
            return Err(ChainError::Snapshot);
        }
        push_u32(&mut out, n);
        out.extend_from_slice(fork);
    }
    write_precommits(&mut out, precommits)?;
    write_ethereum_links(&mut out, ethereum_links)?;
    if out.len() > MAX_SNAPSHOT {
        return Err(ChainError::Snapshot);
    }
    Ok(out)
}

pub(crate) fn decode_snapshot(bytes: &[u8]) -> Result<Snapshot, ChainError> {
    if bytes.len() > MAX_SNAPSHOT {
        return Err(ChainError::Snapshot);
    }
    let mut rd = Rd { buf: bytes, i: 0 };
    let magic = rd.take(8)?;
    let (citations, rounds) = if magic == MAGIC_V7 {
        (true, true)
    } else if magic == MAGIC_V6 {
        (true, false)
    } else if magic == MAGIC_V5 {
        (false, false)
    } else {
        return Err(ChainError::Snapshot);
    };
    let height = rd.u64()?;
    let tip = rd.arr32()?;
    let mmr_count = rd.u64()?;
    let peak_count = rd.u32()? as usize;
    if peak_count != mmr_count.count_ones() as usize || peak_count > 64 {
        return Err(ChainError::Snapshot);
    }
    let mut peaks = Vec::with_capacity(peak_count);
    for _ in 0..peak_count {
        peaks.push(rd.arr32()?);
    }
    let balances = read_accounts(&mut rd)?;
    let nonces = read_accounts(&mut rd)?;
    let block_count = rd.u32()? as usize;
    if block_count as u64 != height || block_count > 100_000 {
        return Err(ChainError::Snapshot);
    }
    let mut blocks = Vec::with_capacity(block_count);
    for _ in 0..block_count {
        let n = rd.u32()? as usize;
        if n == 0 || n > 2 * 1024 * 1024 {
            return Err(ChainError::Snapshot);
        }
        blocks.push(rd.take(n)?.to_vec());
    }
    let queued = rd.u32()? as usize;
    if queued > MAX_MEMPOOL {
        return Err(ChainError::Snapshot);
    }
    let mut mempool = Vec::with_capacity(queued);
    for _ in 0..queued {
        let n = rd.u32()? as usize;
        if n == 0 || n > 16 * 1024 {
            return Err(ChainError::Snapshot);
        }
        mempool.push(decode_tx(rd.take(n)?).map_err(|_| ChainError::Snapshot)?);
    }
    let ed25519 = read_keys(&mut rd)?;
    for public in ed25519.values() {
        libp2p::identity::ed25519::PublicKey::try_from_bytes(public)
            .map_err(|_| ChainError::Snapshot)?;
    }
    let mldsa = read_keys(&mut rd)?;
    for public in mldsa.values() {
        crate::tx::decode_mldsa_public(public).map_err(|_| ChainError::Snapshot)?;
    }
    let fork_count = rd.u32()? as usize;
    if fork_count > 1_000 {
        return Err(ChainError::Snapshot);
    }
    let mut forks = Vec::with_capacity(fork_count);
    for _ in 0..fork_count {
        let n = rd.u32()? as usize;
        if n == 0 || n > 2 * 1024 * 1024 {
            return Err(ChainError::Snapshot);
        }
        forks.push(rd.take(n)?.to_vec());
    }
    let precommits = read_precommits(&mut rd, rounds)?;
    let ethereum_links = if citations {
        read_ethereum_links(&mut rd)?
    } else {
        BTreeMap::new()
    };
    if rd.i != bytes.len() {
        return Err(ChainError::Snapshot);
    }
    Ok(Snapshot {
        height,
        tip,
        mmr_count,
        peaks,
        balances,
        nonces,
        blocks,
        mempool,
        ed25519,
        mldsa,
        forks,
        precommits,
        ethereum_links,
    })
}

fn write_ethereum_links(
    out: &mut Vec<u8>,
    links: &BTreeMap<u64, EthereumExecutionId>,
) -> Result<(), ChainError> {
    let n = u32::try_from(links.len()).map_err(|_| ChainError::Snapshot)?;
    if links.len() > 100_000 {
        return Err(ChainError::Snapshot);
    }
    push_u32(out, n);
    let mut previous_number = 0u64;
    let mut seen_hashes = Vec::new();
    for (height, execution) in links {
        if *height == 0
            || execution.number == 0
            || execution.number <= previous_number
            || execution.hash == [0u8; 32]
            || seen_hashes.contains(&execution.hash)
        {
            return Err(ChainError::Snapshot);
        }
        previous_number = execution.number;
        seen_hashes.push(execution.hash);
        push_u64(out, *height);
        push_u64(out, execution.number);
        out.extend_from_slice(&execution.hash);
    }
    Ok(())
}

fn read_ethereum_links(
    rd: &mut Rd<'_>,
) -> Result<BTreeMap<u64, EthereumExecutionId>, ChainError> {
    let n = rd.u32()? as usize;
    if n > 100_000 {
        return Err(ChainError::Snapshot);
    }
    let mut links = BTreeMap::new();
    let mut previous_number = 0u64;
    let mut seen_hashes = Vec::new();
    for _ in 0..n {
        let height = rd.u64()?;
        let number = rd.u64()?;
        let hash = rd.arr32()?;
        if height == 0
            || links.last_key_value().is_some_and(|(stored, _)| height <= *stored)
            || number == 0
            || number <= previous_number
            || hash == [0u8; 32]
            || seen_hashes.contains(&hash)
        {
            return Err(ChainError::Snapshot);
        }
        previous_number = number;
        seen_hashes.push(hash);
        links.insert(
            height,
            EthereumExecutionId { number, hash },
        );
    }
    Ok(links)
}

pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), ChainError> {
    let tmp = path.with_extension("arkhe-tmp");
    std::fs::write(&tmp, bytes).map_err(|_| ChainError::Snapshot)?;
    if std::fs::rename(&tmp, path).is_ok() {
        return Ok(());
    }
    std::fs::remove_file(path).map_err(|_| ChainError::Snapshot)?;
    std::fs::rename(&tmp, path).map_err(|_| ChainError::Snapshot)
}

fn write_precommits(
    out: &mut Vec<u8>,
    votes: &BTreeMap<(u64, String), crate::StoredPrecommit>,
) -> Result<(), ChainError> {
    let n = u32::try_from(votes.len()).map_err(|_| ChainError::Snapshot)?;
    if votes.len() > 1_000 {
        return Err(ChainError::Snapshot);
    }
    push_u32(out, n);
    for ((height, validator), stored) in votes {
        if validator.is_empty() || validator.len() > 128 {
            return Err(ChainError::Snapshot);
        }
        if stored.preimage == 1 && stored.round != 0 {
            return Err(ChainError::Snapshot);
        }
        if !matches!(stored.preimage, 1 | 2 | 3) {
            return Err(ChainError::Snapshot);
        }
        push_u64(out, *height);
        let len = u32::try_from(validator.len()).map_err(|_| ChainError::Snapshot)?;
        push_u32(out, len);
        out.extend_from_slice(validator.as_bytes());
        push_u64(out, stored.round);
        out.extend_from_slice(&stored.block_hash);
        out.extend_from_slice(&stored.signature);
        out.push(stored.preimage);
    }
    Ok(())
}

fn read_precommits(rd: &mut Rd<'_>, rounds: bool) -> Result<Vec<DecodedPrecommit>, ChainError> {
    let n = rd.u32()? as usize;
    if n > 1_000 {
        return Err(ChainError::Snapshot);
    }
    let mut votes = Vec::with_capacity(n);
    for _ in 0..n {
        let height = rd.u64()?;
        let len = rd.u32()? as usize;
        if len == 0 || len > 128 {
            return Err(ChainError::Snapshot);
        }
        let raw = rd.take(len)?.to_vec();
        let validator_id = std::str::from_utf8(&raw)
            .map_err(|_| ChainError::Snapshot)?
            .to_string();
        let round = if rounds { rd.u64()? } else { 0 };
        let block_hash = rd.arr32()?;
        let signature = rd.take(64)?.try_into().map_err(|_| ChainError::Snapshot)?;
        let preimage = if rounds {
            match rd.take(1)?[0] {
                preimage @ (1 | 2 | 3) => preimage,
                _ => return Err(ChainError::Snapshot),
            }
        } else {
            1
        };
        if preimage == 1 && round != 0 {
            return Err(ChainError::Snapshot);
        }
        votes.push(DecodedPrecommit {
            vote: crate::Precommit {
                validator_id,
                height,
                round,
                block_hash,
                parts: 1,
                part_hash: block_hash,
                signature,
            },
            preimage,
        });
    }
    Ok(votes)
}

fn write_accounts(out: &mut Vec<u8>, map: &BTreeMap<String, u64>) -> Result<(), ChainError> {
    let n = u32::try_from(map.len()).map_err(|_| ChainError::Snapshot)?;
    push_u32(out, n);
    for (account, value) in map {
        if !account_id(account) {
            return Err(ChainError::Snapshot);
        }
        let len = u32::try_from(account.len()).map_err(|_| ChainError::Snapshot)?;
        push_u32(out, len);
        out.extend_from_slice(account.as_bytes());
        push_u64(out, *value);
    }
    Ok(())
}

fn write_keys<const N: usize>(
    out: &mut Vec<u8>,
    map: &BTreeMap<String, [u8; N]>,
) -> Result<(), ChainError> {
    let n = u32::try_from(map.len()).map_err(|_| ChainError::Snapshot)?;
    push_u32(out, n);
    for (account, key) in map {
        if !account_id(account) {
            return Err(ChainError::Snapshot);
        }
        let len = u32::try_from(account.len()).map_err(|_| ChainError::Snapshot)?;
        push_u32(out, len);
        out.extend_from_slice(account.as_bytes());
        out.extend_from_slice(key);
    }
    Ok(())
}

fn read_keys<const N: usize>(rd: &mut Rd<'_>) -> Result<BTreeMap<String, [u8; N]>, ChainError> {
    let n = rd.u32()? as usize;
    if n > 100_000 {
        return Err(ChainError::Snapshot);
    }
    let mut map = BTreeMap::new();
    for _ in 0..n {
        let len = rd.u32()? as usize;
        if len == 0 || len > 128 {
            return Err(ChainError::Snapshot);
        }
        let raw = rd.take(len)?.to_vec();
        let text = std::str::from_utf8(&raw).map_err(|_| ChainError::Snapshot)?;
        if !account_id(text) {
            return Err(ChainError::Snapshot);
        }
        let key = rd.take(N)?.try_into().map_err(|_| ChainError::Snapshot)?;
        if map.insert(text.to_string(), key).is_some() {
            return Err(ChainError::Snapshot);
        }
    }
    Ok(map)
}

fn read_accounts(rd: &mut Rd<'_>) -> Result<BTreeMap<String, u64>, ChainError> {
    let n = rd.u32()? as usize;
    if n > 100_000 {
        return Err(ChainError::Snapshot);
    }
    let mut map = BTreeMap::new();
    for _ in 0..n {
        let len = rd.u32()? as usize;
        if len == 0 || len > 128 {
            return Err(ChainError::Snapshot);
        }
        let raw = rd.take(len)?.to_vec();
        let text = std::str::from_utf8(&raw).map_err(|_| ChainError::Snapshot)?;
        if !account_id(text) {
            return Err(ChainError::Snapshot);
        }
        let value = rd.u64()?;
        if map.insert(text.to_string(), value).is_some() {
            return Err(ChainError::Snapshot);
        }
    }
    Ok(map)
}

fn push_u32(out: &mut Vec<u8>, n: u32) {
    out.extend_from_slice(&n.to_be_bytes());
}
fn push_u64(out: &mut Vec<u8>, n: u64) {
    out.extend_from_slice(&n.to_be_bytes());
}

struct Rd<'a> {
    buf: &'a [u8],
    i: usize,
}

impl Rd<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], ChainError> {
        let end = self.i.checked_add(n).ok_or(ChainError::Snapshot)?;
        if end > self.buf.len() {
            return Err(ChainError::Snapshot);
        }
        let slice = &self.buf[self.i..end];
        self.i = end;
        Ok(slice)
    }
    fn u32(&mut self) -> Result<u32, ChainError> {
        let bytes: [u8; 4] = self.take(4)?.try_into().map_err(|_| ChainError::Snapshot)?;
        Ok(u32::from_be_bytes(bytes))
    }
    fn u64(&mut self) -> Result<u64, ChainError> {
        let bytes: [u8; 8] = self.take(8)?.try_into().map_err(|_| ChainError::Snapshot)?;
        Ok(u64::from_be_bytes(bytes))
    }
    fn arr32(&mut self) -> Result<[u8; 32], ChainError> {
        self.take(32)?.try_into().map_err(|_| ChainError::Snapshot)
    }
}
