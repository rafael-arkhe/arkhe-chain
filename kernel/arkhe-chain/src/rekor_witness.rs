//! Recorded Rekor (RFC 6962) inclusion witnesses for audit bundle digests.
//!
//! Verifies Merkle inclusion, checkpoint binding, and (when present) Rekor
//! checkpoint / SET signatures against a pinned `trusted_root.json`. Synthetic
//! size-1 witnesses omit signatures and skip that step. Optional live fetch is
//! implemented for tests when `ARKHE_REKOR_ONLINE=1`.

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
    /// Leaf index in the inclusion proof (Merkle path).
    pub log_index: u64,
    /// Rekor entry index signed in the SET payload (may differ from [`log_index`]).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_log_index: Option<u64>,
    pub tree_size: u64,
    pub root_hash: [u8; 32],
    pub sibling_hashes: Vec<[u8; 32]>,
    /// Canonical Rekor entry body bytes (pre–Merkle leaf hash).
    pub leaf_body: Vec<u8>,
    /// Original base64 body from Rekor (`entry.body`), used for SET canonicalization.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leaf_body_b64: Option<String>,
    /// Signed checkpoint envelope (`origin`, `tree_size`, `root_hash`, …).
    pub checkpoint_envelope: String,
    /// BLAKE3 digest of the bundle this witness is meant to anchor.
    pub anchored_digest: [u8; 32],
    /// Rekor log id (base64), required when verifying [`signed_entry_timestamp`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_id_key_id: Option<String>,
    /// Rekor log id as lowercase hex (SET payload), when recorded from the API.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_id_hex: Option<String>,
    /// Rekor integrated time (seconds), paired with SET verification.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub integrated_time: Option<i64>,
    /// Base64 SET (`signedEntryTimestamp`) when recorded from a live entry.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signed_entry_timestamp: Option<String>,
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
        entry_log_index: None,
        tree_size: 1,
        root_hash: root,
        sibling_hashes: Vec::new(),
        leaf_body,
        leaf_body_b64: None,
        checkpoint_envelope,
        anchored_digest: *digest,
        log_id_key_id: None,
        log_id_hex: None,
        integrated_time: None,
        signed_entry_timestamp: None,
    }
}

/// Merkle inclusion, checkpoint binding, and Rekor checkpoint / SET signatures (pinned root).
pub fn verify_recorded_witness_rekor_log(
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
    crate::rekor_trust::verify_witness_log_signatures(witness)?;
    Ok(())
}

pub fn verify_recorded_witness(
    bundle_digest: &[u8; 32],
    witness: &RekorInclusionWitness,
) -> Result<(), ChainError> {
    verify_recorded_witness_rekor_log(bundle_digest, witness)
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
    let s = s.trim();
    if s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()) {
        let mut out = [0u8; 32];
        hex::decode_to_slice(s, &mut out).map_err(|_| ChainError::ExternalAnchorRekor("checkpoint-root"))?;
        return Ok(out);
    }
    STANDARD
        .decode(s)
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
        #[serde(flatten)]
        entries: std::collections::BTreeMap<String, Entry>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Entry {
        body: String,
        #[serde(default)]
        integrated_time: Option<i64>,
        #[serde(default, rename = "logID")]
        log_id: Option<String>,
        #[serde(default)]
        log_index: Option<u64>,
        #[serde(default)]
        inclusion_proof: Option<InclusionProof>,
        #[serde(default)]
        verification: Option<Verification>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Verification {
        inclusion_proof: InclusionProof,
        #[serde(default)]
        signed_entry_timestamp: Option<String>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct InclusionProof {
        log_index: u64,
        tree_size: u64,
        root_hash: String,
        hashes: Vec<String>,
        #[serde(default)]
        checkpoint: serde_json::Value,
    }

    let root: Root =
        serde_json::from_slice(entry_json).map_err(|_| ChainError::ExternalAnchorRekor("json"))?;
    let (_, entry) = root
        .entries
        .into_iter()
        .next()
        .ok_or(ChainError::ExternalAnchorRekor("json"))?;
    let (proof, signed_entry_timestamp, integrated_time, log_id, entry_log_index) =
        if let Some(v) = entry.verification {
            (
                v.inclusion_proof,
                v.signed_entry_timestamp,
                entry.integrated_time,
                entry.log_id,
                entry.log_index,
            )
        } else {
            let proof = entry
                .inclusion_proof
                .ok_or(ChainError::ExternalAnchorRekor("json"))?;
            (
                proof,
                None,
                entry.integrated_time,
                entry.log_id,
                entry.log_index,
            )
        };
    let checkpoint_envelope = decode_checkpoint_envelope(&proof.checkpoint)?;
    let root_hash = decode_hash_line(&proof.root_hash)?;
    let sibling_hashes = proof
        .hashes
        .iter()
        .map(|h| decode_hash_line(h))
        .collect::<Result<Vec<_>, _>>()?;
    let body_b64 = entry.body.clone();
    let leaf_body = STANDARD
        .decode(&body_b64)
        .map_err(|_| ChainError::ExternalAnchorRekor("body"))?;
    let (log_id_hex, log_id_key_id) = match log_id.as_deref() {
        Some(id) if id.len() == 64 && id.chars().all(|c| c.is_ascii_hexdigit()) => {
            (Some(id.to_ascii_lowercase()), Some(log_id_hex_to_key_id(id)))
        }
        Some(id) => (None, Some(id.to_string())),
        None => (None, None),
    };
    Ok(RekorInclusionWitness {
        log_origin: log_origin.into(),
        rekor_base_url: rekor_base_url.into(),
        log_index: proof.log_index,
        entry_log_index,
        tree_size: proof.tree_size,
        root_hash,
        sibling_hashes,
        leaf_body,
        leaf_body_b64: Some(body_b64),
        checkpoint_envelope,
        anchored_digest: *bundle_digest,
        log_id_key_id,
        log_id_hex,
        integrated_time,
        signed_entry_timestamp,
    })
}

fn decode_checkpoint_envelope(checkpoint: &serde_json::Value) -> Result<String, ChainError> {
    if let Some(s) = checkpoint.as_str() {
        return Ok(s.to_string());
    }
    checkpoint
        .get("envelope")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or(ChainError::ExternalAnchorRekor("checkpoint"))
}

fn log_id_hex_to_key_id(log_id_hex: &str) -> String {
    let mut buf = vec![0u8; log_id_hex.len() / 2];
    if hex::decode_to_slice(log_id_hex, &mut buf).is_ok() {
        return STANDARD.encode(buf);
    }
    log_id_hex.to_string()
}

/// SHA-256 artifact digest from a `hashedrekord` leaf body when present.
pub fn hashedrekord_sha256_digest(leaf_body: &[u8]) -> Result<[u8; 32], ChainError> {
    #[derive(Deserialize)]
    struct HashedRekord {
        #[serde(default)]
        kind: String,
        spec: Spec,
    }
    #[derive(Deserialize)]
    struct Spec {
        data: Data,
    }
    #[derive(Deserialize)]
    struct Data {
        hash: HashField,
    }
    #[derive(Deserialize)]
    struct HashField {
        value: String,
    }
    let record: HashedRekord =
        serde_json::from_slice(leaf_body).map_err(|_| ChainError::ExternalAnchorRekor("body"))?;
    if record.kind != "hashedrekord" {
        return Err(ChainError::ExternalAnchorRekor("body"));
    }
    let mut out = [0u8; 32];
    hex::decode_to_slice(&record.spec.data.hash.value, &mut out)
        .map_err(|_| ChainError::ExternalAnchorRekor("body"))?;
    Ok(out)
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