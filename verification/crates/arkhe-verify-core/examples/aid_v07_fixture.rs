//! Generator for the frozen AID conformance vectors V07a and V07b.
//!
//! Both swap the operation in the signed payload, `extend` to `rotate`, and
//! differ in what the attacker does with the digest:
//!
//! * V07a keeps the original `aid`. The payload no longer hashes to it, so the
//!   bundle fails at `aid_recomputation`.
//! * V07b recomputes the `aid` honestly and does not renew the signature. The
//!   digest is right and the signature covers a different `aid`, so the bundle
//!   fails at `signature_verification`.
//!
//! The trust policy of this vector authorizes `rotate` for the key. Without
//! that, V07b would stop at `authorization` and would demonstrate the
//! authorization rule instead of the one it was written for.
//!
//! The payload builder is deliberately a copy of the V06 generator's rather
//! than shared with it: a frozen vector must not shift because another
//! vector's generator changed. The predecessor is the same snapshot as in V06,
//! which is why the two files agree on its `aid`.
//!
//! Run: `cargo run -q -p arkhe-verify-core --example aid_v07_fixture`
//! Output: `verification/vectors/aid/V07.json`

use arkhe_verify_core::aid::{self, Profile, TrustRoot};
use arkhe_verify_core::hash::sha256;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};

const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const TRUST_ROOT_ID: &str = "arkhe-aid-test-root";
const VERIFICATION_TIME: &str = "2026-11-20T11:00:00Z";

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{}", hex::encode(sha256(bytes)))
}

fn payload(previous_aid: Option<&str>, manifest: &[u8], instant: &str, operation: &str) -> Value {
    json!({
        "schema_version": aid::SCHEMA_VERSION,
        "agent_id": AGENT_ID,
        "previous_aid": previous_aid,
        "operation": operation,
        "provenance_timestamp": instant,
        "descriptor": {
            "model": {
                "manifest_hash": digest(manifest),
                "architecture": "moe-671b",
                "parameter_count": 671_000_000_000i64
            },
            "history": {
                "history_root": digest(b""),
                "event_count": 0
            }
        }
    })
}

fn evidence(manifest: &[u8]) -> Value {
    json!({
        "model_manifest": hex::encode(manifest),
        "history_events": [],
        "history_consistency_proof": []
    })
}

fn main() {
    // PUBLIC TEST KEY ONLY. Never trust this key for real credentials.
    let key = SigningKey::from_bytes(&[86; 32]);
    let public_key = hex::encode(key.verifying_key().to_bytes());

    let predecessor_manifest = b"arkhe-aid-v06-predecessor-model-manifest".to_vec();
    let successor_manifest = b"arkhe-aid-v06-successor-model-manifest".to_vec();

    let predecessor_payload = payload(
        None,
        &predecessor_manifest,
        "2026-11-20T10:00:00Z",
        "genesis",
    );
    let (predecessor_aid, _) =
        aid::compute_aid(&serde_json::to_vec(&predecessor_payload).unwrap()).unwrap();
    let predecessor_signature =
        hex::encode(key.sign(&aid::signed_bytes(&predecessor_aid)).to_bytes());

    // The snapshot as it was signed: an extension.
    let original_payload = payload(
        Some(&predecessor_aid),
        &successor_manifest,
        "2026-11-20T10:05:00Z",
        "extend",
    );
    let (original_aid, original_canonical) =
        aid::compute_aid(&serde_json::to_vec(&original_payload).unwrap()).unwrap();
    let original_signature = hex::encode(key.sign(&aid::signed_bytes(&original_aid)).to_bytes());

    // The same snapshot with the operation swapped. The operation is inside the
    // payload, so the digest moves with it.
    let swapped_payload = payload(
        Some(&predecessor_aid),
        &successor_manifest,
        "2026-11-20T10:05:00Z",
        "rotate",
    );
    let (swapped_aid, swapped_canonical) =
        aid::compute_aid(&serde_json::to_vec(&swapped_payload).unwrap()).unwrap();

    let signature = |bytes: &str| {
        json!([{
            "role": "emitter",
            "algorithm": "Ed25519",
            "public_key": public_key,
            "signature_bytes": bytes
        }])
    };

    let envelope = |declared_aid: &str| {
        json!({
            "schema_version": aid::SCHEMA_VERSION,
            "payload": swapped_payload,
            "aid": declared_aid,
            // The original signature, not renewed, in both cases.
            "signatures": signature(&original_signature),
            "evidence": evidence(&successor_manifest),
            "predecessor": {
                "aid": predecessor_aid,
                "payload": predecessor_payload,
                "signatures": signature(&predecessor_signature),
                "evidence": evidence(&predecessor_manifest)
            },
            "trust_root_id": TRUST_ROOT_ID
        })
    };

    let trust_root = json!({
        "trust_root_id": TRUST_ROOT_ID,
        "keys": [{
            "public_key": public_key,
            "algorithm": "Ed25519",
            "authorized_agent_ids": [AGENT_ID],
            "authorized_operations": ["genesis", "extend", "rotate"],
            "valid_from": "2026-01-01T00:00:00Z",
            "valid_until": "2027-01-01T00:00:00Z"
        }]
    });
    let policy: TrustRoot = serde_json::from_value(trust_root.clone()).unwrap();

    let case = |declared_aid: &str| {
        let envelope = envelope(declared_aid);
        let result = aid::verify(
            &serde_json::to_vec(&envelope).unwrap(),
            &policy,
            Profile::ModelOnly,
            VERIFICATION_TIME,
        );
        let mut expected = result.to_json();
        let fields = expected.as_object_mut().unwrap();
        fields.insert("declared_aid".into(), json!(declared_aid));
        fields.insert("recomputed_aid".into(), json!(swapped_aid));
        fields.insert("signed_aid".into(), json!(original_aid));
        (envelope, expected)
    };

    let (v07a_envelope, v07a_expected) = case(&original_aid);
    let (v07b_envelope, v07b_expected) = case(&swapped_aid);

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "schema": "arkhe-aid-vector/v1",
            "vector_id": "V07",
            "spec": "AID v1.0-rc5, frozen bytes per docs/AID-CONFORMANCE.md",
            "description": "Operation swapped in the signed payload: extend -> rotate",
            "profile": Profile::ModelOnly.label(),
            "algorithm": "Ed25519",
            "key_warning": "PUBLIC TEST KEY ONLY. Never trust this key for real credentials.",
            "verification_time": VERIFICATION_TIME,
            "trust_root": trust_root,
            "policy_note": "rotate is authorized for this key on purpose; without it V07b would stop at authorization",
            "signed_snapshot": {
                "operation": "extend",
                "aid": original_aid,
                "payload_canonical_bytes_hex": hex::encode(&original_canonical),
                "signature_bytes": original_signature
            },
            "swapped_snapshot": {
                "operation": "rotate",
                "aid": swapped_aid,
                "payload_canonical_bytes_hex": hex::encode(&swapped_canonical)
            },
            "v07a": {
                "description": "operation swapped, original aid kept",
                "envelope": v07a_envelope,
                "expected": v07a_expected
            },
            "v07b": {
                "description": "operation swapped, aid recomputed, signature not renewed",
                "envelope": v07b_envelope,
                "expected": v07b_expected
            }
        }))
        .unwrap()
    );
}
