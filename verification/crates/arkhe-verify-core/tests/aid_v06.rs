//! AID conformance vector V06, at both levels the audit asked for.
//!
//! Unit level: `recompute_predecessor_aid` alone, which demonstrates that the
//! payload is bound to the digest. Integrated level: the whole bundle through
//! `verify`, which demonstrates that the verifier's ordinary entry point
//! applies that binding, and fails at the stage it is supposed to.

use arkhe_verify_core::aid::{
    self, AidError, DimensionStatus, FailureStage, Profile, TrustRoot, Verdict,
};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::Value;

const VECTOR: &str = include_str!("../../../vectors/aid/V06.json");

struct Case {
    envelope: Vec<u8>,
    expected: Value,
    predecessor_payload: Vec<u8>,
    predecessor_declared_aid: String,
}

fn vector() -> Value {
    serde_json::from_str(VECTOR).expect("V06 vector parses")
}

fn case(vector: &Value, name: &str) -> Case {
    let envelope = &vector[name]["envelope"];
    Case {
        envelope: serde_json::to_vec(envelope).unwrap(),
        expected: vector[name]["expected"].clone(),
        predecessor_payload: serde_json::to_vec(&envelope["predecessor"]["payload"]).unwrap(),
        predecessor_declared_aid: envelope["predecessor"]["aid"].as_str().unwrap().to_owned(),
    }
}

fn policy(vector: &Value) -> TrustRoot {
    serde_json::from_value(vector["trust_root"].clone()).expect("trust policy parses")
}

fn verification_time(vector: &Value) -> String {
    vector["verification_time"].as_str().unwrap().to_owned()
}

fn labels(result: &arkhe_verify_core::aid::VerificationResult) -> Vec<(String, &'static str)> {
    result
        .dimensions
        .iter()
        .map(|(name, status)| (name.clone(), status.label()))
        .collect()
}

#[test]
fn v06_frozen_bytes_and_signatures_are_reproducible() {
    let vector = vector();
    let control = case(&vector, "control");
    let envelope: Value = serde_json::from_slice(&control.envelope).unwrap();

    // The successor's canonical bytes and aid.
    let (successor_aid, successor_canonical) =
        aid::compute_aid(&serde_json::to_vec(&envelope["payload"]).unwrap()).unwrap();
    assert_eq!(
        hex::encode(&successor_canonical),
        control.expected["payload_canonical_bytes_hex"]
            .as_str()
            .unwrap(),
        "the frozen canonical payload bytes no longer reproduce"
    );
    assert_eq!(successor_aid, envelope["aid"].as_str().unwrap());
    assert_eq!(successor_aid, control.expected["aid"].as_str().unwrap());

    // The predecessor's canonical bytes and aid.
    let (predecessor_aid, predecessor_canonical) =
        aid::compute_aid(&control.predecessor_payload).unwrap();
    assert_eq!(
        hex::encode(&predecessor_canonical),
        control.expected["predecessor_payload_canonical_bytes_hex"]
            .as_str()
            .unwrap()
    );
    assert_eq!(predecessor_aid, control.predecessor_declared_aid);

    // Both frozen signatures verify over the domain-separated aid text.
    for (aid_text, signatures) in [
        (&successor_aid, &envelope["signatures"]),
        (&predecessor_aid, &envelope["predecessor"]["signatures"]),
    ] {
        let signature = &signatures[0];
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
            .expect("frozen signature verifies over the frozen aid");
    }
}

#[test]
fn v06_unit_control_recomputes_the_declared_predecessor_aid() {
    let vector = vector();
    let control = case(&vector, "control");
    assert_eq!(
        aid::recompute_predecessor_aid(
            &control.predecessor_payload,
            &control.predecessor_declared_aid
        ),
        Ok(control.predecessor_declared_aid.clone())
    );
}

#[test]
fn v06_unit_variant_fails_with_an_aid_mismatch() {
    let vector = vector();
    let variant = case(&vector, "tampered_variant");
    let error = aid::recompute_predecessor_aid(
        &variant.predecessor_payload,
        &variant.predecessor_declared_aid,
    )
    .expect_err("a tampered payload cannot recompute the declared aid");
    assert_eq!(
        error,
        AidError::AidMismatch {
            declared: variant.expected["predecessor_declared_aid"]
                .as_str()
                .unwrap()
                .to_owned(),
            recomputed: variant.expected["predecessor_recomputed_aid"]
                .as_str()
                .unwrap()
                .to_owned(),
        }
    );
}

#[test]
fn v06_integrated_control_passes_under_model_only() {
    let vector = vector();
    let control = case(&vector, "control");
    let result = aid::verify(
        &control.envelope,
        &policy(&vector),
        Profile::ModelOnly,
        &verification_time(&vector),
    );

    assert_eq!(result.verdict, Verdict::Pass, "{:?}", result.reason);
    assert_eq!(result.exit_code, 0);
    assert_eq!(result.failure_stage, None);
    // The three dimensions model-only requires are verified; the four it does
    // not require are declared out of scope, which is not a pass.
    assert_eq!(
        labels(&result),
        vec![
            ("capabilities".to_owned(), "NOT_REQUIRED"),
            ("continuity".to_owned(), "PASS"),
            ("governance".to_owned(), "NOT_REQUIRED"),
            ("history".to_owned(), "PASS"),
            ("model".to_owned(), "PASS"),
            ("runtime".to_owned(), "NOT_REQUIRED"),
            ("training".to_owned(), "NOT_REQUIRED"),
        ]
    );
    assert_eq!(result.to_json(), strip_bytes(&control.expected));
}

#[test]
fn v06_integrated_variant_fails_at_predecessor_aid_recomputation() {
    let vector = vector();
    let variant = case(&vector, "tampered_variant");
    let result = aid::verify(
        &variant.envelope,
        &policy(&vector),
        Profile::ModelOnly,
        &verification_time(&vector),
    );

    assert_eq!(result.verdict, Verdict::Fail);
    assert_eq!(result.exit_code, 1);
    assert_eq!(
        result.failure_stage,
        Some(FailureStage::PredecessorAidRecomputation),
        "the variant must fail at recomputation, before the signature is verified"
    );
    assert!(matches!(
        result.dimensions["continuity"],
        DimensionStatus::Fail { .. }
    ));
    assert_eq!(result.to_json(), strip_bytes(&variant.expected));
}

#[test]
fn v06_variant_carries_a_genuine_signature_over_the_declared_aid() {
    // The point of the vector: nothing is wrong with the signature. It is a
    // real signature by an authorized key over the declared predecessor aid.
    // What is wrong is that the payload no longer hashes to that aid, and only
    // recomputation catches it.
    let vector = vector();
    let variant = case(&vector, "tampered_variant");
    let envelope: Value = serde_json::from_slice(&variant.envelope).unwrap();
    let signature = &envelope["predecessor"]["signatures"][0];
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
        .verify(
            &aid::signed_bytes(&variant.predecessor_declared_aid),
            &Signature::from_bytes(&bytes),
        )
        .expect("the retained signature is genuine over the declared aid");

    // And the payload it now travels with hashes to something else.
    let (recomputed, _) = aid::compute_aid(&variant.predecessor_payload).unwrap();
    assert_ne!(recomputed, variant.predecessor_declared_aid);
}

/// The committed expectation carries the frozen bytes alongside the verdict;
/// the verdict comparison uses only the fields a result reports.
fn strip_bytes(expected: &Value) -> Value {
    let mut expected = expected.clone();
    let fields = expected.as_object_mut().unwrap();
    for key in [
        "aid",
        "payload_canonical_bytes_hex",
        "predecessor_aid",
        "predecessor_payload_canonical_bytes_hex",
        "predecessor_declared_aid",
        "predecessor_recomputed_aid",
        "unit_result",
    ] {
        fields.remove(key);
    }
    expected
}
