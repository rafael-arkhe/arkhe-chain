//! AID conformance vectors V02 and V14: the history that grows, and the
//! boundary of the append-only relation.
//!
//! V02 is the vector a real agent needs. Every execution the adapter appends
//! moves the transition from `N = M` to `N < M`, which only the RFC 9162
//! consistency proof can settle.

use arkhe_verify_core::aid::{
    self, merkle, DimensionStatus, FailureStage, Profile, TrustRoot, Verdict, VerificationResult,
};
use serde_json::Value;

const V02: &str = include_str!("../../../vectors/aid/V02.json");
const V14: &str = include_str!("../../../vectors/aid/V14.json");

fn vector(source: &str) -> Value {
    serde_json::from_str(source).expect("the vector parses")
}

fn run(vector: &Value, case: &str) -> VerificationResult {
    aid::verify(
        &serde_json::to_vec(&vector[case]["envelope"]).unwrap(),
        &serde_json::from_value::<TrustRoot>(vector["trust_root"].clone()).unwrap(),
        Profile::ModelOnly,
        vector["verification_time"].as_str().unwrap(),
    )
}

fn labels(result: &VerificationResult) -> Vec<(&str, &'static str)> {
    result
        .dimensions
        .iter()
        .map(|(name, status)| (name.as_str(), status.label()))
        .collect()
}

/// The frozen expectation also carries the digests; the verdict comparison uses
/// only the fields a result reports.
fn verdict_only(expected: &Value) -> Value {
    let mut expected = expected.clone();
    let fields = expected.as_object_mut().unwrap();
    for key in [
        "aid",
        "payload_canonical_bytes_hex",
        "predecessor_aid",
        "predecessor_payload_canonical_bytes_hex",
    ] {
        fields.remove(key);
    }
    expected
}

#[test]
fn v02_frozen_bytes_reproduce_and_the_events_rebuild_both_roots() {
    let vector = vector(V02);
    for case in ["v02a", "v02b", "v02_without_events"] {
        let envelope = &vector[case]["envelope"];
        let expected = &vector[case]["expected"];
        let (aid_text, canonical) =
            aid::compute_aid(&serde_json::to_vec(&envelope["payload"]).unwrap()).unwrap();
        assert_eq!(
            hex::encode(&canonical),
            expected["payload_canonical_bytes_hex"].as_str().unwrap(),
            "{case}: the frozen canonical bytes no longer reproduce"
        );
        assert_eq!(aid_text, envelope["aid"].as_str().unwrap());
        assert_eq!(aid_text, expected["aid"].as_str().unwrap());
    }

    // The supplied events rebuild the declared roots, and the predecessor's
    // events are a prefix of the successor's.
    let envelope = &vector["v02a"]["envelope"];
    let successor_events = events(&envelope["evidence"]);
    let predecessor_events = events(&envelope["predecessor"]["evidence"]);
    assert_eq!(predecessor_events.len(), 2);
    assert_eq!(successor_events.len(), 5);
    assert_eq!(successor_events[..2], predecessor_events[..]);
    assert_eq!(
        root(&merkle::tree_hash(&successor_events)),
        envelope["payload"]["descriptor"]["history"]["history_root"]
            .as_str()
            .unwrap()
    );
    assert_eq!(
        root(&merkle::tree_hash(&predecessor_events)),
        envelope["predecessor"]["payload"]["descriptor"]["history"]["history_root"]
            .as_str()
            .unwrap()
    );
}

#[test]
fn v02a_an_extension_of_two_to_five_events_passes() {
    let vector = vector(V02);
    let result = run(&vector, "v02a");
    assert_eq!(result.verdict, Verdict::Pass, "{:?}", result.reason);
    assert_eq!(result.exit_code, 0);
    assert_eq!(
        labels(&result),
        vec![
            ("capabilities", "NOT_REQUIRED"),
            ("continuity", "PASS"),
            ("governance", "NOT_REQUIRED"),
            ("history", "PASS"),
            ("model", "PASS"),
            ("runtime", "NOT_REQUIRED"),
            ("training", "NOT_REQUIRED"),
        ]
    );
    assert_eq!(result.to_json(), verdict_only(&vector["v02a"]["expected"]));
}

#[test]
fn v02b_one_appended_execution_passes() {
    // The shape a real agent produces: one event per execution.
    let vector = vector(V02);
    let result = run(&vector, "v02b");
    assert_eq!(result.verdict, Verdict::Pass, "{:?}", result.reason);
    assert_eq!(
        vector["v02b"]["envelope"]["evidence"]["history_consistency_proof"]
            .as_array()
            .unwrap()
            .len(),
        1,
        "a 1 -> 2 extension takes exactly one proof step"
    );
    assert_eq!(result.to_json(), verdict_only(&vector["v02b"]["expected"]));
}

#[test]
fn v02_a_tampered_proof_step_fails_the_consistency_check() {
    // Not a frozen case: it is derived from the frozen one by flipping a bit of
    // the proof, which must move the verdict off PASS.
    let vector = vector(V02);
    let mut envelope = vector["v02a"]["envelope"].clone();
    let step = envelope["evidence"]["history_consistency_proof"][0]
        .as_str()
        .unwrap()
        .to_owned();
    let mut altered = hex::decode(&step).unwrap();
    altered[0] ^= 0x01;
    envelope["evidence"]["history_consistency_proof"][0] = Value::String(hex::encode(altered));

    let result = aid::verify(
        &serde_json::to_vec(&envelope).unwrap(),
        &serde_json::from_value::<TrustRoot>(vector["trust_root"].clone()).unwrap(),
        Profile::ModelOnly,
        vector["verification_time"].as_str().unwrap(),
    );
    assert_eq!(result.verdict, Verdict::Fail);
    assert_eq!(
        result.failure_stage,
        Some(FailureStage::HistoryConsistency),
        "{:?}",
        result.reason
    );
}

#[test]
fn v02_without_events_is_inconclusive_and_keeps_what_was_verified() {
    // A bundle that carries the roots and the proof but not the events proves
    // the relation between the histories and not the histories themselves. It
    // is inconclusive, never a pass — and the model dimension it did verify
    // stays verified in the report.
    let vector = vector(V02);
    let result = run(&vector, "v02_without_events");
    assert_eq!(result.verdict, Verdict::Inconclusive);
    assert_eq!(result.exit_code, 2);
    assert_eq!(result.dimensions["model"], DimensionStatus::Pass);
    assert!(matches!(
        result.dimensions["history"],
        DimensionStatus::Inconclusive { .. }
    ));
    assert!(matches!(
        result.dimensions["continuity"],
        DimensionStatus::Inconclusive { .. }
    ));
    assert_eq!(
        result.to_json(),
        verdict_only(&vector["v02_without_events"]["expected"])
    );
}

#[test]
fn v14a_an_empty_to_empty_transition_with_a_predecessor_passes() {
    let vector = vector(V14);
    let result = run(&vector, "v14a");
    assert_eq!(result.verdict, Verdict::Pass, "{:?}", result.reason);
    assert_eq!(
        vector["v14a"]["envelope"]["payload"]["descriptor"]["history"]["history_root"]
            .as_str()
            .unwrap(),
        root(&merkle::empty_root()),
        "an empty history declares the normative empty root"
    );
    assert_eq!(result.to_json(), verdict_only(&vector["v14a"]["expected"]));
}

#[test]
fn v14b_an_empty_history_with_another_root_fails() {
    let vector = vector(V14);
    let declared = vector["v14b"]["envelope"]["predecessor"]["payload"]["descriptor"]["history"]
        ["history_root"]
        .as_str()
        .unwrap();
    assert_ne!(declared, root(&merkle::empty_root()));

    let result = run(&vector, "v14b");
    assert_eq!(result.verdict, Verdict::Fail);
    assert_eq!(result.failure_stage, Some(FailureStage::Continuity));
    assert!(matches!(
        result.dimensions["continuity"],
        DimensionStatus::Fail { .. }
    ));
    assert_eq!(result.to_json(), verdict_only(&vector["v14b"]["expected"]));
}

#[test]
fn v14c_a_history_that_shrank_fails() {
    let vector = vector(V14);
    let result = run(&vector, "v14c");
    assert_eq!(result.verdict, Verdict::Fail);
    assert_eq!(
        result.failure_stage,
        Some(FailureStage::HistoryConsistency),
        "{:?}",
        result.reason
    );
    assert_eq!(result.to_json(), verdict_only(&vector["v14c"]["expected"]));
}

fn events(evidence: &Value) -> Vec<Vec<u8>> {
    evidence["history_events"]
        .as_array()
        .unwrap()
        .iter()
        .map(|event| hex::decode(event.as_str().unwrap()).unwrap())
        .collect()
}

fn root(digest: &[u8; 32]) -> String {
    format!("sha256:{}", hex::encode(digest))
}
