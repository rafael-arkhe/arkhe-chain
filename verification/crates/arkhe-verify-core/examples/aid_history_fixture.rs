//! Generator for the frozen AID history vectors V02 and V14.
//!
//! V02 is the one the real-agent pilot needs: a history that grows. The
//! predecessor's events are a prefix of the successor's, and the bundle carries
//! the RFC 9162 consistency proof between the two roots.
//!
//! V14 is the boundary of the same rule: the empty-to-empty transition, an
//! empty history that declares the wrong root, and a history that shrank.
//!
//! Run: `cargo run -q -p arkhe-verify-core --example aid_history_fixture -- --vector V02`
//!      `cargo run -q -p arkhe-verify-core --example aid_history_fixture -- --vector V14`
//! Output: `verification/vectors/aid/V02.json`, `verification/vectors/aid/V14.json`

use arkhe_verify_core::aid::{self, jcs::Strict, merkle, Profile, TrustRoot};
use arkhe_verify_core::hash::sha256;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};

const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const TRUST_ROOT_ID: &str = "arkhe-aid-test-root";
const VERIFICATION_TIME: &str = "2026-11-20T11:00:00Z";

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{}", hex::encode(sha256(bytes)))
}

fn bytes(value: &Value) -> Vec<u8> {
    serde_json::to_vec(value).unwrap()
}

/// A history event, as the canonical bytes the leaf hash is applied to once.
fn event(index: usize) -> Vec<u8> {
    let event = json!({
        "event_index": index,
        "kind": "execution",
        "payload_digest": digest(format!("arkhe-aid-event-{index}").as_bytes())
    });
    Strict::parse(&bytes(&event))
        .expect("the event is strict JSON")
        .canonical_bytes()
}

fn events(count: usize) -> Vec<Vec<u8>> {
    (0..count).map(event).collect()
}

/// The history dimension over a list of events.
fn history(events: &[Vec<u8>]) -> Value {
    json!({
        "history_root": format!("sha256:{}", hex::encode(merkle::tree_hash(events))),
        "event_count": events.len()
    })
}

fn payload(previous_aid: Option<&str>, manifest: &[u8], instant: &str, history: Value) -> Value {
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
            "history": history
        }
    })
}

fn evidence(manifest: &[u8], events: &[Vec<u8>], proof: &[[u8; 32]]) -> Value {
    json!({
        "model_manifest": hex::encode(manifest),
        "history_events": events.iter().map(hex::encode).collect::<Vec<_>>(),
        "history_consistency_proof": proof.iter().map(hex::encode).collect::<Vec<_>>()
    })
}

fn main() {
    let vector = std::env::args()
        .skip_while(|a| a != "--vector")
        .nth(1)
        .unwrap_or_else(|| "V02".to_owned());

    // PUBLIC TEST KEY ONLY. Never trust this key for real credentials.
    let key = SigningKey::from_bytes(&[86; 32]);
    let public_key = hex::encode(key.verifying_key().to_bytes());
    let predecessor_manifest = b"arkhe-aid-history-predecessor-model-manifest".to_vec();
    let successor_manifest = b"arkhe-aid-history-successor-model-manifest".to_vec();

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

    let signature = |bytes: &str| {
        json!([{
            "role": "emitter",
            "algorithm": "Ed25519",
            "public_key": public_key,
            "signature_bytes": bytes
        }])
    };

    let assemble = |predecessor_payload: &Value,
                    predecessor_evidence: &Value,
                    successor_payload: &Value,
                    successor_evidence: &Value|
     -> (Value, Value) {
        let (predecessor_aid, predecessor_canonical) =
            aid::compute_aid(&bytes(predecessor_payload)).unwrap();
        let (successor_aid, successor_canonical) =
            aid::compute_aid(&bytes(successor_payload)).unwrap();
        let envelope = json!({
            "schema_version": aid::SCHEMA_VERSION,
            "payload": successor_payload,
            "aid": successor_aid,
            "signatures": signature(&hex::encode(
                key.sign(&aid::signed_bytes(&successor_aid)).to_bytes()
            )),
            "evidence": successor_evidence,
            "predecessor": {
                "aid": predecessor_aid,
                "payload": predecessor_payload,
                "signatures": signature(&hex::encode(
                    key.sign(&aid::signed_bytes(&predecessor_aid)).to_bytes()
                )),
                "evidence": predecessor_evidence
            },
            "trust_root_id": TRUST_ROOT_ID
        });
        let result = aid::verify(
            &bytes(&envelope),
            &policy,
            Profile::ModelOnly,
            VERIFICATION_TIME,
        );
        let mut expected = result.to_json();
        let fields = expected.as_object_mut().unwrap();
        fields.insert("aid".into(), json!(successor_aid));
        fields.insert(
            "payload_canonical_bytes_hex".into(),
            json!(hex::encode(&successor_canonical)),
        );
        fields.insert("predecessor_aid".into(), json!(predecessor_aid));
        fields.insert(
            "predecessor_payload_canonical_bytes_hex".into(),
            json!(hex::encode(&predecessor_canonical)),
        );
        (envelope, expected)
    };

    // One `(N, M)` extension, with the proof the predecessor's prefix admits.
    let extension = |n: usize, m: usize, supply_events: bool| -> (Value, Value) {
        let all = events(m);
        let predecessor_payload = payload(
            None,
            &predecessor_manifest,
            "2026-11-20T10:00:00Z",
            history(&all[..n]),
        );
        let (predecessor_aid, _) = aid::compute_aid(&bytes(&predecessor_payload)).unwrap();
        let successor_payload = payload(
            Some(&predecessor_aid),
            &successor_manifest,
            "2026-11-20T10:05:00Z",
            history(&all),
        );
        let proof = merkle::consistency_proof(&all, n).unwrap();
        let none: Vec<Vec<u8>> = Vec::new();
        let (predecessor_events, successor_events) = if supply_events {
            (all[..n].to_vec(), all.clone())
        } else {
            (none.clone(), none)
        };
        assemble(
            &predecessor_payload,
            &evidence(&predecessor_manifest, &predecessor_events, &[]),
            &successor_payload,
            &evidence(&successor_manifest, &successor_events, &proof),
        )
    };

    let document = match vector.as_str() {
        "V02" => {
            let (a_envelope, a_expected) = extension(2, 5, true);
            let (b_envelope, b_expected) = extension(1, 2, true);
            let (lean_envelope, lean_expected) = extension(1, 2, false);
            json!({
                "schema": "arkhe-aid-vector/v1",
                "vector_id": "V02",
                "spec": "AID v1.0-rc5, frozen bytes per docs/AID-CONFORMANCE.md",
                "description": "Valid extension: the history grows and the consistency proof closes",
                "profile": Profile::ModelOnly.label(),
                "algorithm": "Ed25519",
                "key_warning": "PUBLIC TEST KEY ONLY. Never trust this key for real credentials.",
                "verification_time": VERIFICATION_TIME,
                "trust_root": trust_root,
                "event_bytes_definition": "JCS of the canonical event object; the leaf hash is applied once",
                "v02a": {
                    "description": "2 -> 5 events, a two step proof",
                    "event_counts": { "predecessor": 2, "successor": 5 },
                    "envelope": a_envelope,
                    "expected": a_expected
                },
                "v02b": {
                    "description": "1 -> 2 events, the shape a real agent produces per execution",
                    "event_counts": { "predecessor": 1, "successor": 2 },
                    "envelope": b_envelope,
                    "expected": b_expected
                },
                "v02_without_events": {
                    "description": "the same 1 -> 2 roots and proof, with no events supplied: continuity is provable, the history dimension is not",
                    "event_counts": { "predecessor": 1, "successor": 2 },
                    "envelope": lean_envelope,
                    "expected": lean_expected
                }
            })
        }
        "V14" => {
            // V14a: both histories empty, with a non-null previous_aid.
            let empty: Vec<Vec<u8>> = Vec::new();
            let a_predecessor = payload(
                None,
                &predecessor_manifest,
                "2026-11-20T10:00:00Z",
                history(&empty),
            );
            let (a_predecessor_aid, _) = aid::compute_aid(&bytes(&a_predecessor)).unwrap();
            let a_successor = payload(
                Some(&a_predecessor_aid),
                &successor_manifest,
                "2026-11-20T10:05:00Z",
                history(&empty),
            );
            let (a_envelope, a_expected) = assemble(
                &a_predecessor,
                &evidence(&predecessor_manifest, &empty, &[]),
                &a_successor,
                &evidence(&successor_manifest, &empty, &[]),
            );

            // V14b: the predecessor declares no events and a root that is not
            // the normative empty root.
            let b_predecessor = payload(
                None,
                &predecessor_manifest,
                "2026-11-20T10:00:00Z",
                json!({
                    "history_root": digest(b"a history that was never recorded"),
                    "event_count": 0
                }),
            );
            let (b_predecessor_aid, _) = aid::compute_aid(&bytes(&b_predecessor)).unwrap();
            let b_successor = payload(
                Some(&b_predecessor_aid),
                &successor_manifest,
                "2026-11-20T10:05:00Z",
                history(&empty),
            );
            let (b_envelope, b_expected) = assemble(
                &b_predecessor,
                &evidence(&predecessor_manifest, &empty, &[]),
                &b_successor,
                &evidence(&successor_manifest, &empty, &[]),
            );

            // V14c: the successor declares fewer events than the predecessor.
            let all = events(2);
            let c_predecessor = payload(
                None,
                &predecessor_manifest,
                "2026-11-20T10:00:00Z",
                history(&all),
            );
            let (c_predecessor_aid, _) = aid::compute_aid(&bytes(&c_predecessor)).unwrap();
            let c_successor = payload(
                Some(&c_predecessor_aid),
                &successor_manifest,
                "2026-11-20T10:05:00Z",
                history(&all[..1]),
            );
            let (c_envelope, c_expected) = assemble(
                &c_predecessor,
                &evidence(&predecessor_manifest, &all, &[]),
                &c_successor,
                &evidence(&successor_manifest, &all[..1], &[]),
            );

            json!({
                "schema": "arkhe-aid-vector/v1",
                "vector_id": "V14",
                "spec": "AID v1.0-rc5, frozen bytes per docs/AID-CONFORMANCE.md",
                "description": "The boundary of the append-only relation between two histories",
                "profile": Profile::ModelOnly.label(),
                "algorithm": "Ed25519",
                "key_warning": "PUBLIC TEST KEY ONLY. Never trust this key for real credentials.",
                "verification_time": VERIFICATION_TIME,
                "trust_root": trust_root,
                "v14a": {
                    "description": "N = M = 0 with a non-null previous_aid and the normative empty root",
                    "envelope": a_envelope,
                    "expected": a_expected
                },
                "v14b": {
                    "description": "N = 0 with a declared root that is not SHA-256(\"\")",
                    "envelope": b_envelope,
                    "expected": b_expected
                },
                "v14c": {
                    "description": "M < N: the history shrank",
                    "envelope": c_envelope,
                    "expected": c_expected
                }
            })
        }
        other => {
            eprintln!("unknown vector {other}; expected V02 or V14");
            std::process::exit(2);
        }
    };

    println!("{}", serde_json::to_string_pretty(&document).unwrap());
}
