//! Deterministic signing payload for one validator round vote.

use arkhe_core::Digest32;

/// The only chain id accepted on a canonical vote.
pub const CANONICAL_CHAIN_ID: &str = "arkhe-chain";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VoteType {
    Prevote,
    Precommit,
}

/// Ordered fields serialized manually so two validators binding the same
/// facts produce identical `sign_bytes`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanonicalVote {
    pub chain_id: String,
    pub height: u64,
    pub part: String,
    pub round: u32,
    pub block_id: Option<[u8; 32]>,
    pub timestamp_ms: u64,
    pub vote_type: VoteType,
}

impl CanonicalVote {
    pub fn new(
        part: impl Into<String>,
        height: u64,
        round: u32,
        block_id: Option<[u8; 32]>,
        timestamp_ms: u64,
        vote_type: VoteType,
    ) -> Self {
        Self {
            chain_id: CANONICAL_CHAIN_ID.to_string(),
            height,
            part: part.into(),
            round,
            block_id,
            timestamp_ms,
            vote_type,
        }
    }

    /// JSON object with keys sorted lexicographically, no insignificant whitespace.
    pub fn sign_bytes(&self) -> Vec<u8> {
        let bid = match &self.block_id {
            Some(h) => hex32(h),
            None => "nil".to_string(),
        };
        let vt = match self.vote_type {
            VoteType::Prevote => "prevote",
            VoteType::Precommit => "precommit",
        };
        format!(
            "{{\"block_id\":\"{bid}\",\"chain_id\":\"{}\",\"height\":{},\"part\":\"{}\",\"round\":{},\"timestamp_ms\":{},\"vote_type\":\"{vt}\"}}",
            self.chain_id, self.height, self.part, self.round, self.timestamp_ms
        )
        .into_bytes()
    }

    pub fn digest(&self) -> [u8; 32] {
        Digest32::blake3(b"AKG:CHAIN:CANONICAL-VOTE:v1\0", &self.sign_bytes()).0
    }
}

fn hex32(hash: &[u8; 32]) -> String {
    hash.iter().map(|b| format!("{b:02x}")).collect()
}