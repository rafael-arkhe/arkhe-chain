//! Generator for the frozen AID vectors V01, V03 and V04 — the basic cases of
//! a transition, where the previous vectors were all negatives.
//!
//! The three are built from the same two snapshots the V06 vector freezes, so
//! the files are mutually auditable: V01 is the V06 predecessor presented on
//! its own, V03 is the V06 successor with its predecessor removed, and V04 is
//! V01 again under a policy that authorizes the key for another agent. The
//! `aid` values must therefore match V06's, and a test asserts it.
//!
//! * V01 — an authorized genesis. `PASS`.
//! * V03 — `previous_aid` declared with no predecessor presented. Missing
//!   evidence, not a contradiction: `INCONCLUSIVE`, and the dimensions that can
//!   still be verified are.
//! * V04 — a key the policy authorizes for a different `agent_id`. `FAIL` at
//!   authorization, with the envelope byte-identical to V01's: authorization
//!   lives in the verifier's policy, never in the bundle.
//!
//! Run: `cargo run -q -p arkhe-verify-core --example aid_basics_fixture -- --vector V01`
//! Output: `verification/vectors/aid/V01.json`, `V03.json`, `V04.json`

use arkhe_verify_core::aid::{self, Profile, TrustRoot};
use arkhe_verify_core::hash::sha256;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};

const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_AGENT_ID: &str = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const TRUST_ROOT_ID: &str = "arkhe-aid-test-root";
const VERIFICATION_TIME: &str = "2026-11-20T11:00:00Z";

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{}", hex::encode(sha256(bytes)))
}

fn bytes(value: &Value) -> Vec<u8> {
    serde_json::to_vec(value).unwrap()
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
    let vector = std::env::args()
        .skip_while(|a| a != "--vector")
        .nth(1)
        .unwrap_or_else(|| "V01".to_owned());

    // PUBLIC TEST KEY ONLY. Never trust this key for real credentials.
    let key = SigningKey::from_bytes(&[86; 32]);
    let public_key = hex::encode(key.verifying_key().to_bytes());

    // The same manifests and instants the V06 vector freezes.
    let predecessor_manifest = b"arkhe-aid-v06-predecessor-model-manifest".to_vec();
    let successor_manifest = b"arkhe-aid-v06-successor-model-manifest".to_vec();

    let signature = |aid_text: &str| {
        json!([{
            "role": "emitter",
            "algorithm": "Ed25519",
            "public_key": public_key,
            "signature_bytes": hex::encode(key.sign(&aid::signed_bytes(aid_text)).to_bytes())
        }])
    };

    let policy_for = |agent_id: &str| {
        json!({
            "trust_root_id": TRUST_ROOT_ID,
            "keys": [{
                "public_key": public_key,
                "algorithm": "Ed25519",
                "authorized_agent_ids": [agent_id],
                "authorized_operations": ["genesis", "extend"],
                "valid_from": "2026-01-01T00:00:00Z",
                "valid_until": "2027-01-01T00:00:00Z"
            }]
        })
    };

    // The genesis: the V06 predecessor, presented on its own.
    let genesis_payload = payload(None, &predecessor_manifest, "2026-11-20T10:00:00Z");
    let (genesis_aid, genesis_canonical) = aid::compute_aid(&bytes(&genesis_payload)).unwrap();
    let genesis_envelope = json!({
        "schema_version": aid::SCHEMA_VERSION,
        "payload": genesis_payload,
        "aid": genesis_aid,
        "signatures": signature(&genesis_aid),
        "evidence": evidence(&predecessor_manifest),
        "trust_root_id": TRUST_ROOT_ID
    });

    // The extension with its predecessor removed: the V06 successor, alone.
    let orphan_payload = payload(
        Some(&genesis_aid),
        &successor_manifest,
        "2026-11-20T10:05:00Z",
    );
    let (orphan_aid, orphan_canonical) = aid::compute_aid(&bytes(&orphan_payload)).unwrap();
    let orphan_envelope = json!({
        "schema_version": aid::SCHEMA_VERSION,
        "payload": orphan_payload,
        "aid": orphan_aid,
        "signatures": signature(&orphan_aid),
        "evidence": evidence(&successor_manifest),
        "trust_root_id": TRUST_ROOT_ID
    });

    let evaluate = |envelope: &Value, trust_root: &Value, aid_text: &str, canonical: &[u8]| {
        let policy: TrustRoot = serde_json::from_value(trust_root.clone()).unwrap();
        let result = aid::verify(
            &bytes(envelope),
            &policy,
            Profile::ModelOnly,
            VERIFICATION_TIME,
        );
        let mut expected = result.to_json();
        let fields = expected.as_object_mut().unwrap();
        fields.insert("aid".into(), json!(aid_text));
        fields.insert(
            "payload_canonical_bytes_hex".into(),
            json!(hex::encode(canonical)),
        );
        expected
    };

    let header = |id: &str, description: &str| {
        json!({
            "schema": "arkhe-aid-vector/v1",
            "vector_id": id,
            "spec": "AID v1.0-rc5, frozen bytes per docs/AID-CONFORMANCE.md",
            "description": description,
            "profile": Profile::ModelOnly.label(),
            "algorithm": "Ed25519",
            "key_warning": "PUBLIC TEST KEY ONLY. Never trust this key for real credentials.",
            "verification_time": VERIFICATION_TIME
        })
    };

    let document = match vector.as_str() {
        "V01" => {
            let trust_root = policy_for(AGENT_ID);
            let expected = evaluate(
                &genesis_envelope,
                &trust_root,
                &genesis_aid,
                &genesis_canonical,
            );
            let mut document = header("V01", "An authorized genesis, presented on its own");
            let fields = document.as_object_mut().unwrap();
            fields.insert("trust_root".into(), trust_root);
            fields.insert("envelope".into(), genesis_envelope);
            fields.insert("expected".into(), expected);
            fields.insert(
                "what_it_does_not_prove".into(),
                json!(
                    "that this is the agent's only genesis: a second authorized genesis would \
                     pass on its own too, and no registry or checkpoint selects between them"
                ),
            );
            document
        }
        "V03" => {
            let trust_root = policy_for(AGENT_ID);
            let expected = evaluate(
                &orphan_envelope,
                &trust_root,
                &orphan_aid,
                &orphan_canonical,
            );
            let mut document = header(
                "V03",
                "previous_aid is declared and no predecessor is presented",
            );
            let fields = document.as_object_mut().unwrap();
            fields.insert("trust_root".into(), trust_root);
            fields.insert("envelope".into(), orphan_envelope);
            fields.insert("expected".into(), expected);
            fields.insert("declared_previous_aid".into(), json!(genesis_aid));
            document
        }
        "V04" => {
            // The same envelope as V01, under a policy for another agent.
            let trust_root = policy_for(OTHER_AGENT_ID);
            let expected = evaluate(
                &genesis_envelope,
                &trust_root,
                &genesis_aid,
                &genesis_canonical,
            );
            let mut document = header("V04", "The signing key is authorized for another agent_id");
            let fields = document.as_object_mut().unwrap();
            fields.insert("trust_root".into(), trust_root);
            fields.insert("envelope".into(), genesis_envelope);
            fields.insert("expected".into(), expected);
            fields.insert("payload_agent_id".into(), json!(AGENT_ID));
            fields.insert("authorized_agent_id".into(), json!(OTHER_AGENT_ID));
            fields.insert(
                "note".into(),
                json!(
                    "the envelope is byte-identical to V01's; only the verifier's policy differs"
                ),
            );
            document
        }
        other => {
            eprintln!("unknown vector {other}; expected V01, V03 or V04");
            std::process::exit(2);
        }
    };

    println!("{}", serde_json::to_string_pretty(&document).unwrap());
}
