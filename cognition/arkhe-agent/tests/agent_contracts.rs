use arkhe_agent::{
    budget_pco::{infer, prove},
    eval_learning::predict,
    license_pco::{propose_output, prove_license},
    plan, PlanStep,
};
use arkhe_cognition_sdk::{
    formal_proof::{LicenseInput, LicensePolicy, ProofCarryingOutput},
    output_proof::{BudgetInput, BudgetSpec, BUDGET_CHECKER, MAX_BUDGET_ITEMS},
    work::{RequestIdentity, WorkIntent, WorkIntentType},
    worker::WorkerExecutionRecord,
    CanonicalEncode, Digest32,
};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};

fn sample_intent(parameters_digest: Digest32) -> WorkIntent {
    WorkIntent {
        requested_by: "agent-test".into(),
        intent_type: WorkIntentType::Publish,
        target: Digest32([7; 32]),
        parameters_digest,
        context: vec![],
        context_refs: vec![],
        request_identity: RequestIdentity(Digest32([8; 32])),
        claimed_created_at: 1_700_000_000,
    }
}

#[test]
fn plan_binds_intent_and_step_order_without_claiming_authorization() {
    let intent = sample_intent(Digest32([1; 32]));
    let s1 = PlanStep {
        step_id: "s1".into(),
        action: "draft".into(),
        protected: false,
    };
    let s2 = PlanStep {
        step_id: "s2".into(),
        action: "publish".into(),
        protected: true,
    };
    let (p_ab, w_ab) = plan(&intent, vec![s1.clone(), s2.clone()]);
    let (p_ba, w_ba) = plan(&intent, vec![s2, s1]);

    assert_eq!(w_ab.input_digest, intent.digest());
    assert_eq!(w_ab.output_digest, p_ab.plan_digest);
    assert_ne!(p_ab.plan_digest, p_ba.plan_digest);
    assert_ne!(w_ab.digest(), w_ba.digest());
    assert_eq!(w_ab.digest(), w_ab.object_digest());
    assert!(w_ab
        .uncertainty_note
        .as_deref()
        .unwrap_or("")
        .contains("not authorization"));
}

#[test]
fn budget_pco_enforces_bounds_overflow_and_proposal_bindings() {
    let spec = BudgetSpec {
        version: 1,
        limit: 100,
        max_items: 4,
    };
    let input = BudgetInput {
        costs: vec![30, 20, 50],
    };
    let (output, deriv) = infer(&input, &spec).unwrap();
    assert_eq!(output.total, 100);
    assert_eq!(deriv, vec![0, 30, 50, 100]);

    // Overrun fails closed with no partial output.
    assert_eq!(
        infer(
            &BudgetInput {
                costs: vec![60, 41]
            },
            &spec
        )
        .unwrap_err(),
        "budget exceeded"
    );

    // u64 addition overflow fails closed.
    let huge_spec = BudgetSpec {
        version: 1,
        limit: u64::MAX,
        max_items: 4,
    };
    assert_eq!(
        infer(
            &BudgetInput {
                costs: vec![u64::MAX, 1]
            },
            &huge_spec
        )
        .unwrap_err(),
        "budget sum overflow"
    );

    // Unsupported version, empty costs, and max_items > MAX_BUDGET_ITEMS fail closed.
    assert!(infer(&BudgetInput { costs: vec![] }, &spec).is_err());
    assert!(infer(
        &input,
        &BudgetSpec {
            version: 2,
            limit: 100,
            max_items: 4
        }
    )
    .is_err());
    assert!(infer(
        &input,
        &BudgetSpec {
            version: 1,
            limit: 100,
            max_items: (MAX_BUDGET_ITEMS as u16) + 1
        }
    )
    .is_err());

    let intent = sample_intent(output.digest());
    let worker = WorkerExecutionRecord {
        classification: None,
        operation: None,
        module_id: "arkhe-agent".into(),
        module_version: "0.1.0".into(),
        input_digest: input.digest(),
        output_digest: output.digest(),
        evidence_refs: vec![],
        confidence_bps: None,
        uncertainty_note: None,
        execution_id: "budget-1".into(),
    };
    let policy_digest = Digest32([9; 32]);
    let proof = prove(input.clone(), &spec, policy_digest, &intent, &worker).unwrap();
    assert_eq!(proof.checker, BUDGET_CHECKER);
    assert_eq!(proof.intent_digest, intent.digest());
    assert_eq!(proof.worker_digest, worker.digest());

    // Zero policy_digest or mismatched intent parameters_digest must fail.
    assert!(prove(input.clone(), &spec, Digest32::ZERO, &intent, &worker).is_err());
    let wrong_intent = sample_intent(Digest32([0xee; 32]));
    assert!(prove(input, &spec, policy_digest, &wrong_intent, &worker).is_err());
}

#[test]
fn license_pco_and_affine_eval_learner_behave_deterministically() {
    let input = LicenseInput {
        spdx_json: r#"{"spdxVersion":"SPDX-2.3"}"#.into(),
        artifact: b"binary-bytes".to_vec(),
    };
    let out = propose_output(&input);
    assert!(out.compatible);
    assert_eq!(out.sbom_digest, input.sbom_digest());
    assert_eq!(out.artifact_digest, input.artifact_digest());

    let spec = LicensePolicy {
        version: 1,
        obligations: BTreeMap::new(),
        permitted_obligations: BTreeSet::new(),
        require_zk: false,
    };
    let intent = sample_intent(out.digest());
    let (_, worker) = plan(&intent, vec![]);
    let pco = prove_license(input, &spec, Digest32([5; 32]), &intent, &worker);
    match pco {
        ProofCarryingOutput::License(lp) => {
            assert_eq!(lp.checker, "arkhe/spdx23-obligations/v1");
            assert_eq!(lp.spec_digest, spec.digest());
            assert_eq!(lp.intent_digest, intent.digest());
            assert_eq!(lp.worker_digest, worker.digest());
        }
        _ => panic!("expected License variant"),
    }

    // Affine learner y = 3x + 2.
    assert_eq!(
        predict(&json!({ "examples": [[1, 5], [3, 11], [5, 17]], "query": 10 })),
        Some(32)
    );
    // Non-collinear third point -> None.
    assert_eq!(
        predict(&json!({ "examples": [[1, 5], [3, 11], [5, 18]], "query": 10 })),
        None
    );
    // Vertical line or non-integer slope -> None.
    assert_eq!(
        predict(&json!({ "examples": [[2, 5], [2, 9]], "query": 4 })),
        None
    );
    assert_eq!(
        predict(&json!({ "examples": [[0, 0], [2, 1]], "query": 4 })),
        None
    );
}
