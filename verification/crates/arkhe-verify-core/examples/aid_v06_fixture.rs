//! Generator for the frozen AID conformance vector V06.
//!
//! V06 is the vector that demonstrates the central rule of the AID: a
//! predecessor's `aid` is recomputed from its payload before any signature is
//! verified. The control passes under `model-only`; the variant changes one
//! field of the predecessor's payload, keeps the original `aid` and the
//! original signature, and must fail at `predecessor_aid_recomputation`.
//!
//! Run: `cargo run -p arkhe-verify-core --example aid_v06_fixture`
//! Output: `verification/vectors/aid/V06.json`

use arkhe_verify_core::aid::{self, Profile, TrustRoot};
use arkhe_verify_core::hash::sha256;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};

const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const TRUST_ROOT_ID: &str = "arkhe-aid-test-root";
const VERIFICATION_TIME: &str = "2026-11-20T11:00:00Z";
const TAMPERED_ROOT: &str =
    "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{}", hex::encode(sha256(bytes)))
}

fn payload(previous_aid: Option<&str>, manifest: &[u8], instant: &str) -> Value {
    json!({
        "schema_version": aid::SCHEMA_VERSION,
        "agent_id": AGENT_ID,
        "previous_aid": previous_aid,
        "operation": if previous_aid.is_some() { "extend" } else { "genesis" },
        "provenance_timestamp": instant,
        "descriptor": {
            "model": {
                "manifest_hash": digest(manifest),
                "architecture": "moe-671b",
                "parameter_count": 671_000_000_000i64
            },
            // Both histories are empty: the normative empty root, a declared
            // count of zero, and the empty consistency proof inherited by the
            // empty-to-empty case.
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

    let predecessor_payload = payload(None, &predecessor_manifest, "2026-11-20T10:00:00Z");
    let (predecessor_aid, predecessor_canonical) =
        aid::compute_aid(&serde_json::to_vec(&predecessor_payload).unwrap()).unwrap();
    let predecessor_signature = hex::encode(key.sign(&aid::signed_bytes(&predecessor_aid)).to_bytes());

    let successor_payload = payload(
        Some(&predecessor_aid),
        &successor_manifest,
        "2026-11-20T10:05:00Z",
    );
    let (successor_aid, successor_canonical) =
        aid::compute_aid(&serde_json::to_vec(&successor_payload).unwrap()).unwrap();
    let successor_signature = hex::encode(key.sign(&aid::signed_bytes(&successor_aid)).to_bytes());

    let signature = |bytes: &str| {
        json!([{
            "role": "emitter",
            "algorithm": "Ed25519",
            "public_key": public_key,
            "signature_bytes": bytes
        }])
    };

    let envelope = |predecessor_payload: &Value| {
        json!({
            "schema_version": aid::SCHEMA_VERSION,
            "payload": successor_payload,
            "aid": successor_aid,
            "signatures": signature(&successor_signature),
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

    // The variant changes one field of the predecessor's payload. The declared
    // `aid` and the signature over it stay the originals.
    let mut tampered_payload = predecessor_payload.clone();
    tampered_payload["descriptor"]["history"]["history_root"] = json!(TAMPERED_ROOT);
    let (tampered_recomputed, tampered_canonical) =
        aid::compute_aid(&serde_json::to_vec(&tampered_payload).unwrap()).unwrap();

    let trust_root = json!({
        "trust_root_id": TRUST_ROOT_ID,
        "keys": [{
            "public_key": public_key,
            "algorithm": "Ed25519",
            "authorized_agent_ids": [AGENT_ID],
            "authorized_operations": ["genesis", "extend"],
            "valid_from": "2026-01-01T00:00:00Z",
            "valid_until": "2027-01-01T00:00:00Z"
        }]
    });
    let policy: TrustRoot = serde_json::from_value(trust_root.clone()).unwrap();

    let control = envelope(&predecessor_payload);
    let variant = envelope(&tampered_payload);
    let control_result = aid::verify(
        &serde_json::to_vec(&control).unwrap(),
        &policy,
        Profile::ModelOnly,
        VERIFICATION_TIME,
    );
    let variant_result = aid::verify(
        &serde_json::to_vec(&variant).unwrap(),
        &policy,
        Profile::ModelOnly,
        VERIFICATION_TIME,
    );

    let mut control_expected = control_result.to_json();
    let mut variant_expected = variant_result.to_json();
    let control_fields = control_expected.as_object_mut().unwrap();
    control_fields.insert(
        "payload_canonical_bytes_hex".into(),
        json!(hex::encode(&successor_canonical)),
    );
    control_fields.insert("aid".into(), json!(successor_aid));
    control_fields.insert(
        "predecessor_payload_canonical_bytes_hex".into(),
        json!(hex::encode(&predecessor_canonical)),
    );
    control_fields.insert("predecessor_aid".into(), json!(predecessor_aid));
    control_fields.insert("unit_result".into(), json!("ok"));
    let variant_fields = variant_expected.as_object_mut().unwrap();
    variant_fields.insert(
        "predecessor_payload_canonical_bytes_hex".into(),
        json!(hex::encode(&tampered_canonical)),
    );
    variant_fields.insert("predecessor_declared_aid".into(), json!(predecessor_aid));
    variant_fields.insert(
        "predecessor_recomputed_aid".into(),
        json!(tampered_recomputed),
    );
    variant_fields.insert("unit_result".into(), json!("aid_mismatch"));

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "schema": "arkhe-aid-vector/v1",
            "vector_id": "V06",
            "spec": "AID v1.0-rc5, frozen bytes per docs/AID-CONFORMANCE.md",
            "description": "Tampered predecessor: payload field changed, declared aid and signature kept",
            "profile": Profile::ModelOnly.label(),
            "algorithm": "Ed25519",
            "key_warning": "PUBLIC TEST KEY ONLY. Never trust this key for real credentials.",
            "verification_time": VERIFICATION_TIME,
            "trust_root": trust_root,
            "tampered_field": "predecessor.payload.descriptor.history.history_root",
            "control": { "envelope": control, "expected": control_expected },
            "tampered_variant": { "envelope": variant, "expected": variant_expected }
        }))
        .unwrap()
    );
}
