//! P-06 — Close the deterministic invariant loop:
//! Run `invariant.no-direct-identifier` (unprivileged, no signing key, no
//! network) over real output bytes, sign the resulting `invariant` body with
//! the separate `invariant` role key (never the agent/flow key), and verify
//! the agent action with `--invariant` and `--expect-invariant`.
//!
//! Includes both positive (`held: true` -> `llm_output: PASS`) and negative
//! controls (one flipped byte / direct identifier -> `held: false` signed ->
//! `llm_output: FAIL`; and post-emission byte tamper -> `output: FAIL`,
//! `llm_output: FAIL`).

use arkhe_anonymize::{evaluate_no_direct_identifier_body, NO_DIRECT_IDENTIFIER_ID};
use arkhe_flow::{
    agent_action_body, secret_from_seed, sha256_hex, sign_body_with, trust_from_secrets,
    FileSigner, GATE0_AGENT, GATE0_ANCHOR_SEED, GATE0_FLOW_SEED, GATE0_INVARIANT_SEED,
    GATE0_MODEL, GATE0_PLAN, GATE0_PURPOSE, GATE0_STORAGE_SEED,
};
use arkhe_provenance_mcp::{judge, VerifyRequest};

fn build_four_role_trust() -> (FileSigner, FileSigner, arkhe_flow::Trust) {
    let flow = secret_from_seed("flow", GATE0_FLOW_SEED).unwrap();
    let storage = secret_from_seed("storage", GATE0_STORAGE_SEED).unwrap();
    let anchor = secret_from_seed("anchor", GATE0_ANCHOR_SEED).unwrap();
    let invariant = secret_from_seed("invariant", GATE0_INVARIANT_SEED).unwrap();
    let trust = trust_from_secrets(
        GATE0_PURPOSE,
        &[flow.clone(), storage, anchor, invariant.clone()],
    )
    .unwrap();
    (
        FileSigner::from_secret(flow).unwrap(),
        FileSigner::from_secret(invariant).unwrap(),
        trust,
    )
}

#[test]
fn p06_end_to_end_deterministic_invariant_passes_and_flipped_byte_fails() {
    let (flow_signer, invariant_signer, trust) = build_four_role_trust();
    let plan_sha = sha256_hex(GATE0_PLAN);
    let model_sha = sha256_hex(GATE0_MODEL);

    // 1. Clean JSON bytes (no direct identifiers) -> invariant holds (`held: true`).
    let clean_bytes = br#"{"cnpj":"00.000.000/0001-91","valor":1250,"status":"ok"}"#;
    let clean_sha = sha256_hex(clean_bytes);
    let action = sign_body_with(
        &flow_signer,
        &agent_action_body(&plan_sha, &clean_sha, &model_sha, GATE0_AGENT).unwrap(),
    )
    .unwrap();

    // Unprivileged runner evaluates bytes without any signing key.
    let body_ok = evaluate_no_direct_identifier_body(&action.id, clean_bytes).unwrap();
    assert_eq!(body_ok["held"], true);
    assert_eq!(body_ok["invariant_id"], NO_DIRECT_IDENTIFIER_ID);
    assert_eq!(body_ok["output_sha256"], clean_sha);

    // Role separation: agent (`flow`) key CANNOT sign the invariant body!
    assert!(
        sign_body_with(&flow_signer, &body_ok).is_err(),
        "flow role must never be able to sign an invariant verdict"
    );

    // Separate `invariant` role signs the body.
    let verdict_ok = sign_body_with(&invariant_signer, &body_ok).unwrap();

    // Verify action WITH named invariant -> llm_output: PASS, overall: PASS.
    let res_ok = judge(&VerifyRequest {
        receipt: action.clone(),
        trust: trust.clone(),
        expect_purpose: Some(GATE0_PURPOSE.into()),
        tenant: None,
        subject_sha256: None,
        policy_sha256: None,
        admission_id: None,
        commit_id: None,
        artifact_sha256: Some(clean_sha.clone()),
        model_sha256: Some(model_sha.clone()),
        data_sha256: None,
        pipeline_sha256: None,
        plan_sha256: Some(plan_sha.clone()),
        output_sha256: Some(clean_sha.clone()),
        action_id: None,
        invariant: Some(verdict_ok.clone()),
        expect_invariant: Some(NO_DIRECT_IDENTIFIER_ID.into()),
        expect_invariant_version: None,
        anchor_checkpoint: None,
        anchor_inclusion: None,
    });
    assert_eq!(res_ok.components["llm_output"], "PASS", "{:?}", res_ok.notes);
    assert_eq!(res_ok.components["output"], "PASS");
    assert_eq!(res_ok.components["produced"], "PASS");
    assert_eq!(res_ok.overall, "PASS");
    assert_eq!(res_ok.exit_code(), 0);

    // 2. Negative control A: flip ONE byte in the artifact -> malformed JSON ->
    //    runner emits legitimate signed `held: false` verdict -> action gets `llm_output: FAIL`.
    let mut flipped = clean_bytes.to_vec();
    flipped[0] ^= 0x01; // '{' -> 'z', breaks JSON structure
    let flipped_sha = sha256_hex(&flipped);
    let bad_action = sign_body_with(
        &flow_signer,
        &agent_action_body(&plan_sha, &flipped_sha, &model_sha, GATE0_AGENT).unwrap(),
    )
    .unwrap();
    let body_fail = evaluate_no_direct_identifier_body(&bad_action.id, &flipped).unwrap();
    assert_eq!(body_fail["held"], false);
    let verdict_fail = sign_body_with(&invariant_signer, &body_fail).unwrap();

    // The refused verdict itself is a legitimately signed receipt (`signature: PASS`, `held: FAIL`).
    let verdict_alone = judge(&VerifyRequest {
        receipt: verdict_fail.clone(),
        trust: trust.clone(),
        expect_purpose: Some(GATE0_PURPOSE.into()),
        tenant: None,
        subject_sha256: None,
        policy_sha256: None,
        admission_id: None,
        commit_id: None,
        artifact_sha256: None,
        model_sha256: None,
        data_sha256: None,
        pipeline_sha256: None,
        plan_sha256: None,
        output_sha256: Some(flipped_sha.clone()),
        action_id: Some(bad_action.id.clone()),
        invariant: None,
        expect_invariant: None,
        expect_invariant_version: None,
        anchor_checkpoint: None,
        anchor_inclusion: None,
    });
    assert_eq!(verdict_alone.components["signature"], "PASS");
    assert_eq!(verdict_alone.components["signer"], "PASS");
    assert_eq!(verdict_alone.components["held"], "FAIL");
    assert_eq!(verdict_alone.overall, "FAIL");

    // And the action accompanied by that `held: false` verdict gets `llm_output: FAIL`.
    let res_fail = judge(&VerifyRequest {
        receipt: bad_action,
        trust: trust.clone(),
        expect_purpose: Some(GATE0_PURPOSE.into()),
        tenant: None,
        subject_sha256: None,
        policy_sha256: None,
        admission_id: None,
        commit_id: None,
        artifact_sha256: Some(flipped_sha.clone()),
        model_sha256: Some(model_sha.clone()),
        data_sha256: None,
        pipeline_sha256: None,
        plan_sha256: Some(plan_sha.clone()),
        output_sha256: Some(flipped_sha),
        action_id: None,
        invariant: Some(verdict_fail),
        expect_invariant: Some(NO_DIRECT_IDENTIFIER_ID.into()),
        expect_invariant_version: None,
        anchor_checkpoint: None,
        anchor_inclusion: None,
    });
    assert_eq!(res_fail.components["llm_output"], "FAIL");
    assert_eq!(res_fail.overall, "FAIL");

    // 3. Negative control B: output carrying a real direct identifier (email) also yields `held: false`.
    let pii_bytes = br#"{"nota":"contato pessoa@example.test","valor":1250}"#;
    let body_pii = evaluate_no_direct_identifier_body(&action.id, pii_bytes).unwrap();
    assert_eq!(body_pii["held"], false);

    // 4. R-02: Mismatched `expect_invariant_version` refuses discharge on an otherwise valid `verdict_ok`.
    let wrong_ver = judge(&VerifyRequest {
        receipt: action,
        trust,
        expect_purpose: Some(GATE0_PURPOSE.into()),
        tenant: None,
        subject_sha256: None,
        policy_sha256: None,
        admission_id: None,
        commit_id: None,
        artifact_sha256: Some(clean_sha.clone()),
        model_sha256: Some(model_sha),
        data_sha256: None,
        pipeline_sha256: None,
        plan_sha256: Some(plan_sha),
        output_sha256: Some(clean_sha),
        action_id: None,
        invariant: Some(verdict_ok),
        expect_invariant: Some(NO_DIRECT_IDENTIFIER_ID.into()),
        expect_invariant_version: Some("9.9.9".into()),
        anchor_checkpoint: None,
        anchor_inclusion: None,
    });
    assert_eq!(wrong_ver.components["llm_output"], "FAIL");
    assert_eq!(wrong_ver.overall, "FAIL");
}
