mod support;
use agi_coder_core::*;
use agi_coder_kernel::*;
use ed25519_dalek::SigningKey;
use support::*;
fn allowed(intent: &WorkIntent, r: WorkerExecutionRecord, p: &Policy, now: i64) -> bool {
    let mut store = InMemoryEvidenceStore::default();
    let hash = r.record_hash;
    if store.insert(Evidence::WorkerExecution(r)).is_err() {
        return false;
    }
    ContainmentGate::authorize(intent, hash, &store, p, Timestamp(now)).is_ok()
}
#[test]
fn valid_evidence_authorizes_exact_request() {
    let i = intent();
    let r = record(&i);
    assert!(allowed(&i, r.clone(), &policy(&r), 102));
}
#[test]
fn missing_evidence_is_denied() {
    let i = intent();
    let r = record(&i);
    assert!(ContainmentGate::authorize(
        &i,
        r.record_hash,
        &InMemoryEvidenceStore::default(),
        &policy(&r),
        Timestamp(102)
    )
    .is_err());
}
#[test]
fn altered_output_is_denied() {
    let i = intent();
    let mut r = record(&i);
    let p = policy(&r);
    r.output = ContentHash::hash(b"attacker");
    assert!(!allowed(&i, r, &p, 102));
}
#[test]
fn untrusted_valid_signature_is_denied() {
    let i = intent();
    let r = record(&i);
    let mut p = policy(&r);
    p.allowed_signers.clear();
    assert!(!allowed(&i, r, &p, 102));
}
#[test]
fn changed_parameters_cannot_reuse_evidence() {
    let mut i = intent();
    let r = record(&i);
    let p = policy(&r);
    i.parameters = serde_json::json!({"goal":"exfiltrate"});
    assert!(!allowed(&i, r, &p, 102));
}
#[test]
fn another_operation_cannot_reuse_evidence() {
    let mut i = intent();
    let r = record(&i);
    let p = policy(&r);
    i.request_identity = RequestIdentity::new(b"request-2");
    assert!(!allowed(&i, r, &p, 102));
}
#[test]
fn caller_cannot_invent_passing_self_check() {
    let i = intent();
    let mut r = record(&i);
    let p = policy(&r);
    r.tests.failed = 1;
    r = r.sign(&SigningKey::from_bytes(&[42; 32])).unwrap();
    assert_eq!(r.self_check, SelfCheckResult::Fail);
    assert!(!allowed(&i, r, &p, 102));
}
#[test]
fn absent_or_skipped_tests_are_denied() {
    for (passed, skipped) in [(0, 0), (1, 1)] {
        let i = intent();
        let mut r = record(&i);
        let p = policy(&r);
        r.tests = TestResults {
            passed,
            failed: 0,
            skipped,
        };
        r = r.sign(&SigningKey::from_bytes(&[42; 32])).unwrap();
        assert!(!allowed(&i, r, &p, 102));
    }
}
#[test]
fn future_and_stale_records_are_denied() {
    let i = intent();
    let r = record(&i);
    for now in [100, 162] {
        assert!(!allowed(&i, r.clone(), &policy(&r), now));
    }
}
#[test]
fn wrong_expected_artifact_is_denied() {
    let i = intent();
    let r = record(&i);
    let mut p = policy(&r);
    p.expected_output = ContentHash::ZERO;
    assert!(!allowed(&i, r, &p, 102));
}
#[test]
fn unauthorized_requester_or_operation_is_denied() {
    let i = intent();
    let r = record(&i);
    let mut p = policy(&r);
    p.allowed_requesters.clear();
    assert!(!allowed(&i, r.clone(), &p, 102));
    p = policy(&r);
    p.allowed_operations.clear();
    assert!(!allowed(&i, r, &p, 102));
}
#[test]
fn deterministic_cbor_uses_length_first_map_order() {
    let bytes = cbor::canonical(&serde_json::json!({"aa":1,"b":2})).unwrap();
    assert_eq!(bytes, vec![0xa2, 0x61, b'b', 2, 0x62, b'a', b'a', 1]);
    assert!(cbor::canonical(&serde_json::json!(1.5)).is_err());
}
#[test]
fn domain_separation_and_framing_are_unambiguous() {
    assert_ne!(
        ContentHash::domain("a", &[b"bc"]),
        ContentHash::domain("ab", &[b"c"])
    );
    assert_ne!(
        ContentHash::domain("a", &[b"b", b"c"]),
        ContentHash::domain("a", &[b"bc"])
    );
}
#[test]
fn static_wer_matches_reviewable_fixture() {
    let i = intent();
    let r = record(&i);
    // A committed fixture is checked, never regenerated in CI.
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../../tests/golden/wer_vectors.json")).unwrap();
    assert_eq!(serde_json::to_value(&r).unwrap(), fixture["record"]);
    assert_eq!(serde_json::to_value(&i).unwrap(), fixture["intent"]);
}
