//! AID conformance vectors V07a and V07b: the operation is inside the digest.
//!
//! The payload declares the operation, so the operation is covered by the
//! `aid` and therefore by the signature over it. An attacker who swaps the
//! operation has two options and both fail, at different stages:
//!
//! * keep the original `aid` — the payload no longer hashes to it (V07a);
//! * recompute the `aid` — the retained signature covers another one (V07b).

use arkhe_verify_core::aid::{self, FailureStage, Operation, Profile, TrustRoot, Verdict};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::Value;

const VECTOR: &str = include_str!("../../../vectors/aid/V07.json");

fn vector() -> Value {
    serde_json::from_str(VECTOR).expect("V07 vector parses")
}

fn policy(vector: &Value) -> TrustRoot {
    serde_json::from_value(vector["trust_root"].clone()).expect("trust policy parses")
}

fn run(vector: &Value, name: &str) -> arkhe_verify_core::aid::VerificationResult {
    aid::verify(
        &serde_json::to_vec(&vector[name]["envelope"]).unwrap(),
        &policy(vector),
        Profile::ModelOnly,
        vector["verification_time"].as_str().unwrap(),
    )
}

fn verifies(signature: &Value, aid_text: &str) -> bool {
    let key: [u8; 32] = hex::decode(signature["public_key"].as_str().unwrap())
        .unwrap()
        .try_into()
        .unwrap();
    let bytes: [u8; 64] = hex::decode(signature["signature_bytes"].as_str().unwrap())
        .unwrap()
        .try_into()
        .unwrap();
    VerifyingKey::from_bytes(&key)
        .unwrap()
        .verify(&aid::signed_bytes(aid_text), &Signature::from_bytes(&bytes))
        .is_ok()
}

#[test]
fn v07_frozen_bytes_and_signature_are_reproducible() {
    let vector = vector();
    let signed = &vector["signed_snapshot"];
    let swapped = &vector["swapped_snapshot"];

    // The swapped payload, as both envelopes carry it.
    let payload = &vector["v07a"]["envelope"]["payload"];
    assert_eq!(payload, &vector["v07b"]["envelope"]["payload"]);
    let (swapped_aid, swapped_canonical) =
        aid::compute_aid(&serde_json::to_vec(payload).unwrap()).unwrap();
    assert_eq!(
        hex::encode(&swapped_canonical),
        swapped["payload_canonical_bytes_hex"].as_str().unwrap(),
        "the frozen canonical bytes of the swapped payload no longer reproduce"
    );
    assert_eq!(swapped_aid, swapped["aid"].as_str().unwrap());
    assert_ne!(swapped_aid, signed["aid"].as_str().unwrap().to_owned());

    // The retained signature is genuine over the aid it was made for, and over
    // nothing else.
    let signature = &vector["v07a"]["envelope"]["signatures"][0];
    assert_eq!(
        signature["signature_bytes"].as_str().unwrap(),
        signed["signature_bytes"].as_str().unwrap()
    );
    assert!(verifies(signature, signed["aid"].as_str().unwrap()));
    assert!(!verifies(signature, swapped["aid"].as_str().unwrap()));
}

#[test]
fn v07_the_operation_is_covered_by_the_digest() {
    // Put the original operation back into the swapped payload and the signed
    // aid returns. Nothing else in the payload was touched.
    let vector = vector();
    let mut payload = vector["v07a"]["envelope"]["payload"].clone();
    assert_eq!(
        payload["operation"],
        vector["swapped_snapshot"]["operation"]
    );
    payload["operation"] = vector["signed_snapshot"]["operation"].clone();
    let (restored_aid, restored_canonical) =
        aid::compute_aid(&serde_json::to_vec(&payload).unwrap()).unwrap();
    assert_eq!(restored_aid, vector["signed_snapshot"]["aid"]);
    assert_eq!(
        hex::encode(&restored_canonical),
        vector["signed_snapshot"]["payload_canonical_bytes_hex"]
            .as_str()
            .unwrap()
    );
}

#[test]
fn v07a_operation_swapped_with_the_original_aid_fails_at_recomputation() {
    let vector = vector();
    let result = run(&vector, "v07a");
    assert_eq!(result.verdict, Verdict::Fail);
    assert_eq!(result.exit_code, 1);
    assert_eq!(
        result.failure_stage,
        Some(FailureStage::AidRecomputation),
        "the declared aid is the one of the unswapped payload"
    );
    assert_eq!(result.to_json(), strip_bytes(&vector["v07a"]["expected"]));
}

#[test]
fn v07b_operation_swapped_with_a_recomputed_aid_fails_at_the_signature() {
    let vector = vector();
    let expected = &vector["v07b"]["expected"];

    // The digest is right: the declared aid is what the swapped payload hashes
    // to. So the bundle must survive recomputation and stop at the signature.
    assert_eq!(expected["declared_aid"], expected["recomputed_aid"]);
    assert_ne!(expected["declared_aid"], expected["signed_aid"]);
    // And the stop is not authorization: the key is authorized for `rotate`.
    assert!(policy(&vector).keys[0]
        .authorized_operations
        .contains(&Operation::Rotate));

    let result = run(&vector, "v07b");
    assert_eq!(result.verdict, Verdict::Fail);
    assert_eq!(result.exit_code, 1);
    assert_eq!(
        result.failure_stage,
        Some(FailureStage::SignatureVerification),
        "the signature was not renewed over the recomputed aid"
    );
    assert_eq!(result.to_json(), strip_bytes(expected));
}

/// The committed expectation carries the three digests alongside the verdict;
/// the verdict comparison uses only the fields a result reports.
fn strip_bytes(expected: &Value) -> Value {
    let mut expected = expected.clone();
    let fields = expected.as_object_mut().unwrap();
    for key in ["declared_aid", "recomputed_aid", "signed_aid"] {
        fields.remove(key);
    }
    expected
}
