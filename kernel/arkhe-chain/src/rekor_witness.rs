//! Recorded Rekor (RFC 6962) inclusion witnesses for audit bundle digests.
//!
//! Verifies Merkle inclusion and checkpoint binding offline. Optional live fetch
//! is implemented for tests when `ARKHE_REKOR_ONLINE=1`.

use crate::error::ChainError;
use crate::rfc6962::{hash_leaf, verify_inclusion_proof};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

/// Default public Rekor instance (`rekor.sigstore.dev` shard 0).
pub const DEFAULT_REKOR_ORIGIN: &str = "rekor.sigstore.dev - 1193050959916656506";
pub const DEFAULT_REKOR_BASE_URL: &str = "https://rekor.sigstore.dev";

/// Inclusion material captured from Rekor `inclusionProof` plus the signed entry body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RekorInclusionWitness {
    /// Checkpoint origin line, e.g. `rekor.sigstore.dev - <log id>`.
    pub log_origin: String,
    /// Configured Rekor base URL (metadata; not fetched during offline verify).
    pub rekor_base_url: String,
    pub log_index: u64,
    pub tree_size: u64,
    pub root_hash: [u8; 32],
    pub sibling_hashes: Vec<[u8; 32]>,
    /// Canonical Rekor entry body bytes (pre–Merkle leaf hash).
    pub leaf_body: Vec<u8>,
    /// Signed checkpoint envelope (`origin`, `tree_size`, `root_hash`, …).
    pub checkpoint_envelope: String,
    /// BLAKE3 digest of the bundle this witness is meant to anchor.
    pub anchored_digest: [u8; 32],
}

/// Deterministic leaf bytes for tests and tooling (not a live Rekor `hashedrekord`).
pub fn synthetic_anchor_leaf(digest: &[u8; 32]) -> Vec<u8> {
    const PREFIX: &[u8] = b"AKG:CHAIN:REKOR:ANCHOR:v1\0";
    let mut out = Vec::with_capacity(PREFIX.len() + 32);
    out.extend_from_slice(PREFIX);
    out.extend_from_slice(digest);
    out
}

/// Build a size-1 synthetic witness (valid RFC 6962 math, not on a live log).
pub fn synthetic_witness_for_digest(digest: &[u8; 32]) -> RekorInclusionWitness {
    let leaf_body = synthetic_anchor_leaf(digest);
    let root = hash_leaf(&leaf_body);
    let root_b64 = STANDARD.encode(root);
    let checkpoint_envelope = format!(
        "{DEFAULT_REKOR_ORIGIN}\n1\n{root_b64}\n"
    );
    RekorInclusionWitness {
        log_origin: DEFAULT_REKOR_ORIGIN.into(),
        rekor_base_url: DEFAULT_REKOR_BASE_URL.into(),
        log_index: 0,
        tree_size: 1,
        root_hash: root,
        sibling_hashes: Vec::new(),
        leaf_body,
        checkpoint_envelope,
        anchored_digest: *digest,
    }
}

pub fn verify_recorded_witness(
    bundle_digest: &[u8; 32],
    witness: &RekorInclusionWitness,
) -> Result<(), ChainError> {
    if &witness.anchored_digest != bundle_digest {
        return Err(ChainError::ExternalAnchorRekor("digest"));
    }
    if witness.tree_size == 0 || witness.log_index >= witness.tree_size {
        return Err(ChainError::ExternalAnchorRekor("index"));
    }
    verify_checkpoint_envelope(
        &witness.checkpoint_envelope,
        &witness.log_origin,
        witness.tree_size,
        &witness.root_hash,
    )?;
    if witness.root_hash != decode_checkpoint_root(&witness.checkpoint_envelope)? {
        return Err(ChainError::ExternalAnchorRekor("checkpoint"));
    }
    let leaf_hash = hash_leaf(&witness.leaf_body);
    if !verify_inclusion_proof(
        &leaf_hash,
        witness.log_index,
        witness.tree_size,
        &witness.sibling_hashes,
        &witness.root_hash,
    ) {
        return Err(ChainError::ExternalAnchorRekor("inclusion"));
    }
    Ok(())
}

fn verify_checkpoint_envelope(
    envelope: &str,
    expected_origin: &str,
    expected_size: u64,
    expected_root: &[u8; 32],
) -> Result<(), ChainError> {
    let mut lines = envelope.lines();
    if lines.next() != Some(expected_origin) {
        return Err(ChainError::ExternalAnchorRekor("origin"));
    }
    let size = lines
        .next()
        .and_then(|n| n.parse::<u64>().ok())
        .ok_or(ChainError::ExternalAnchorRekor("checkpoint-size"))?;
    if size != expected_size {
        return Err(ChainError::ExternalAnchorRekor("checkpoint-size"));
    }
    let root = decode_hash_line(lines.next().ok_or(ChainError::ExternalAnchorRekor("checkpoint-root"))?)?;
    if root != *expected_root {
        return Err(ChainError::ExternalAnchorRekor("checkpoint-root"));
    }
    Ok(())
}

fn decode_checkpoint_root(envelope: &str) -> Result<[u8; 32], ChainError> {
    let line = envelope
        .lines()
        .nth(2)
        .ok_or(ChainError::ExternalAnchorRekor("checkpoint-root"))?;
    decode_hash_line(line)
}

fn decode_hash_line(s: &str) -> Result<[u8; 32], ChainError> {
    STANDARD
        .decode(s.trim())
        .map_err(|_| ChainError::ExternalAnchorRekor("checkpoint-root"))?
        .try_into()
        .map_err(|_| ChainError::ExternalAnchorRekor("checkpoint-root"))
}

/// Parse a Rekor `GET /api/v1/log/entries/{uuid}` JSON body into a witness for one bundle digest.
pub fn witness_from_rekor_entry_json(
    bundle_digest: &[u8; 32],
    rekor_base_url: &str,
    log_origin: &str,
    entry_json: &[u8],
) -> Result<RekorInclusionWitness, ChainError> {
    #[derive(Deserialize)]
    struct Root {
        #[serde(default)]
        entries: std::collections::BTreeMap<String, Entry>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Entry {
        body: String,
        inclusion_proof: InclusionProof,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct InclusionProof {
        log_index: u64,
        tree_size: u64,
        root_hash: String,
        hashes: Vec<String>,
        checkpoint: Checkpoint,
    }
    #[derive(Deserialize)]
    struct Checkpoint {
        envelope: String,
    }

    let root: Root =
        serde_json::from_slice(entry_json).map_err(|_| ChainError::ExternalAnchorRekor("json"))?;
    let (_, entry) = root
        .entries
        .into_iter()
        .next()
        .ok_or(ChainError::ExternalAnchorRekor("json"))?;
    let proof = entry.inclusion_proof;
    let root_hash = decode_hash_line(&proof.root_hash)?;
    let sibling_hashes = proof
        .hashes
        .iter()
        .map(|h| decode_hash_line(h))
        .collect::<Result<Vec<_>, _>>()?;
    let leaf_body = STANDARD
        .decode(entry.body)
        .map_err(|_| ChainError::ExternalAnchorRekor("body"))?;
    Ok(RekorInclusionWitness {
        log_origin: log_origin.into(),
        rekor_base_url: rekor_base_url.into(),
        log_index: proof.log_index,
        tree_size: proof.tree_size,
        root_hash,
        sibling_hashes,
        leaf_body,
        checkpoint_envelope: proof.checkpoint.envelope,
        anchored_digest: *bundle_digest,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_witness_verifies() {
        let digest = [7u8; 32];
        let witness = synthetic_witness_for_digest(&digest);
        verify_recorded_witness(&digest, &witness).unwrap();
        let mut bad = digest;
        bad[0] ^= 1;
        assert_eq!(
            verify_recorded_witness(&bad, &witness),
            Err(ChainError::ExternalAnchorRekor("digest"))
        );
    }
}