//! AID conformance vectors V01, V03 and V04: the basic cases of a transition.
//!
//! The three are the same two snapshots the V06 vector freezes, presented
//! differently. The `aid` values must match V06's byte for byte — asserted
//! here, because that is what makes the vector files mutually auditable rather
//! than four unrelated fixtures.

use arkhe_verify_core::aid::{self, DimensionStatus, FailureStage, Profile, TrustRoot, Verdict};
use serde_json::Value;

const V01: &str = include_str!("../../../vectors/aid/V01.json");
const V03: &str = include_str!("../../../vectors/aid/V03.json");
const V04: &str = include_str!("../../../vectors/aid/V04.json");
const V06: &str = include_str!("../../../vectors/aid/V06.json");

fn vector(source: &str) -> Value {
    serde_json::from_str(source).expect("the vector parses")
}

fn run(vector: &Value) -> arkhe_verify_core::aid::VerificationResult {
    aid::verify(
        &serde_json::to_vec(&vector["envelope"]).unwrap(),
        &serde_json::from_value::<TrustRoot>(vector["trust_root"].clone()).unwrap(),
        Profile::ModelOnly,
        vector["verification_time"].as_str().unwrap(),
    )
}

fn verdict_only(expected: &Value) -> Value {
    let mut expected = expected.clone();
    let fields = expected.as_object_mut().unwrap();
    fields.remove("aid");
    fields.remove("payload_canonical_bytes_hex");
    expected
}

#[test]
fn the_frozen_bytes_reproduce_and_agree_with_v06() {
    let v06 = vector(V06);
    let v06_control = &v06["control"]["envelope"];

    for (name, source, v06_aid) in [
        (
            "V01",
            V01,
            v06_control["predecessor"]["aid"].as_str().unwrap(),
        ),
        ("V03", V03, v06_control["aid"].as_str().unwrap()),
        (
            "V04",
            V04,
            v06_control["predecessor"]["aid"].as_str().unwrap(),
        ),
    ] {
        let vector = vector(source);
        let (aid_text, canonical) =
            aid::compute_aid(&serde_json::to_vec(&vector["envelope"]["payload"]).unwrap()).unwrap();
        assert_eq!(
            hex::encode(&canonical),
            vector["expected"]["payload_canonical_bytes_hex"]
                .as_str()
                .unwrap(),
            "{name}: the frozen canonical bytes no longer reproduce"
        );
        assert_eq!(aid_text, vector["envelope"]["aid"].as_str().unwrap());
        assert_eq!(
            aid_text, v06_aid,
            "{name} must be the same snapshot V06 freezes"
        );
    }

    // V04 differs from V01 only in the verifier's policy.
    assert_eq!(vector(V01)["envelope"], vector(V04)["envelope"]);
    assert_ne!(vector(V01)["trust_root"], vector(V04)["trust_root"]);
}

#[test]
fn v01_an_authorized_genesis_passes() {
    let vector = vector(V01);
    assert_eq!(vector["envelope"]["payload"]["previous_aid"], Value::Null);
    assert!(vector["envelope"].get("predecessor").is_none());

    let result = run(&vector);
    assert_eq!(result.verdict, Verdict::Pass, "{:?}", result.reason);
    assert_eq!(result.exit_code, 0);
    // There is no edge to verify, and the signed declaration that there is none
    // is what passes. Whether this is the agent's only genesis is undetermined:
    // a second authorized genesis would pass on its own too.
    assert_eq!(result.dimensions["continuity"], DimensionStatus::Pass);
    assert_eq!(result.to_json(), verdict_only(&vector["expected"]));
}

#[test]
fn v03_a_declared_predecessor_that_is_absent_is_inconclusive() {
    let vector = vector(V03);
    assert!(vector["envelope"]["payload"]["previous_aid"].is_string());
    assert!(vector["envelope"].get("predecessor").is_none());

    let result = run(&vector);
    assert_eq!(result.verdict, Verdict::Inconclusive);
    assert_eq!(result.exit_code, 2);
    // Missing evidence is not a contradiction, so there is no failure stage,
    // and the dimensions that could still be verified were.
    assert_eq!(result.failure_stage, None);
    assert!(matches!(
        result.dimensions["continuity"],
        DimensionStatus::Inconclusive { .. }
    ));
    assert_eq!(result.dimensions["model"], DimensionStatus::Pass);
    assert_eq!(result.dimensions["history"], DimensionStatus::Pass);
    assert_eq!(result.to_json(), verdict_only(&vector["expected"]));
}

#[test]
fn v04_a_key_authorized_for_another_agent_fails() {
    let vector = vector(V04);
    let authorized = vector["trust_root"]["keys"][0]["authorized_agent_ids"][0]
        .as_str()
        .unwrap();
    let declared = vector["envelope"]["payload"]["agent_id"].as_str().unwrap();
    assert_ne!(authorized, declared);

    let result = run(&vector);
    assert_eq!(result.verdict, Verdict::Fail);
    assert_eq!(result.exit_code, 1);
    assert_eq!(
        result.failure_stage,
        Some(FailureStage::Authorization),
        "{:?}",
        result.reason
    );
    assert_eq!(result.to_json(), verdict_only(&vector["expected"]));
}

#[test]
fn v01_and_v04_show_that_authorization_is_not_in_the_bundle() {
    // The same bytes, signed by the same key, verified against two policies:
    // one authorizes the key for this agent and one does not. Nothing in the
    // envelope decides it.
    let v01 = vector(V01);
    let v04 = vector(V04);
    assert_eq!(run(&v01).verdict, Verdict::Pass);
    assert_eq!(run(&v04).verdict, Verdict::Fail);
}
