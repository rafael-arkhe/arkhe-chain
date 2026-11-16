//! Offline verification of a committed public Rekor entry (no network in CI).

use arkhe_chain::{
    hashedrekord_sha256_digest, verify_recorded_witness, witness_from_rekor_entry_json,
    ChainError, DEFAULT_REKOR_BASE_URL, DEFAULT_REKOR_ORIGIN,
};
use sha2::{Digest, Sha256};

const ENTRY_JSON: &[u8] = include_bytes!("fixtures/rekor_entry_arkhe_verify_wasm.json");
const ENTRY_SHA256: &str = "d6c0acdb8eeb50555d28bdcc5c68ae11458e94af930c91d57cbd9674db13962c";

fn fixture_digest_matches() {
    let mut hasher = Sha256::new();
    hasher.update(ENTRY_JSON);
    let digest = format!("{:x}", hasher.finalize());
    assert_eq!(digest, ENTRY_SHA256, "fixture bytes must match committed digest");
}

#[test]
fn committed_public_rekor_entry_merkle_and_checkpoint_offline() {
    fixture_digest_matches();
    let witness = witness_from_rekor_entry_json(
        &[0u8; 32],
        DEFAULT_REKOR_BASE_URL,
        DEFAULT_REKOR_ORIGIN,
        ENTRY_JSON,
    )
    .expect("parse fixture");
    let artifact = hashedrekord_sha256_digest(&witness.leaf_body).expect("hashedrekord digest");
    let mut bound = witness;
    bound.anchored_digest = artifact;
    // Strip SET so Merkle + checkpoint path is exercised; SET remains set-pending.
    bound.signed_entry_timestamp = None;
    verify_recorded_witness(&artifact, &bound).expect("merkle + checkpoint");
}

#[test]
fn fixture_with_set_fails_closed_as_set_pending() {
    fixture_digest_matches();
    let witness = witness_from_rekor_entry_json(
        &[0u8; 32],
        DEFAULT_REKOR_BASE_URL,
        DEFAULT_REKOR_ORIGIN,
        ENTRY_JSON,
    )
    .expect("parse fixture");
    let artifact = hashedrekord_sha256_digest(&witness.leaf_body).unwrap();
    let mut bound = witness;
    bound.anchored_digest = artifact;
    assert!(bound.signed_entry_timestamp.is_some());
    assert_eq!(
        verify_recorded_witness(&artifact, &bound),
        Err(ChainError::ExternalAnchorRekor("set-pending"))
    );
}

#[test]
fn set_canonical_payload_digest_is_stable() {
    fixture_digest_matches();
    let witness = witness_from_rekor_entry_json(
        &[0u8; 32],
        DEFAULT_REKOR_BASE_URL,
        DEFAULT_REKOR_ORIGIN,
        ENTRY_JSON,
    )
    .expect("parse");
    let body_b64 = witness.leaf_body_b64.as_deref().expect("body b64");
    let log_id = witness.log_id_hex.as_deref().expect("log id hex");
    let t = witness.integrated_time.expect("integrated");
    let idx = witness.entry_log_index.expect("entry log index") as i64;
    assert_eq!(idx, 3_456_086_791);
    assert_eq!(witness.log_index, 3_334_182_529);
    let canonical = format!(
        r#"{{"body":"{body_b64}","integratedTime":{t},"logID":"{}","logIndex":{idx}}}"#,
        log_id.to_ascii_lowercase()
    );
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    assert_eq!(
        digest,
        "361218e3cf73eb4ffa2e56ffe252520e0c7d11089f38da650b36678e9548bb6b",
        "SET canonical payload"
    );
}
