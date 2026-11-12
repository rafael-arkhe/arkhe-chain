use std::collections::BTreeMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use arkhe_chain::{
    public_key, sign_attestation, AttestPolicy, AttestRegistry, Attestation, ChainError, Claim, Grant, Role,
    ATTEST_SCHEME_ED25519, ATTEST_SIGNER_QUOTA, ATTEST_VERSION,
};
use arkhe_verify_core::rbb::mmr;

const CHAIN: &str = "arkhe-chain";
const AUDIENCE: &str = "shadow-optimizer";
const GENESIS: [u8; 32] = [9; 32];
const ARTIFACT: [u8; 32] = [0xA1; 32];
const ACTION: [u8; 32] = [0xAC; 32];
const H: u64 = 10;
const BUDGET: u64 = 5;

/// Account, key byte and the roles root grants it.
const ACCOUNTS: [(&str, u8, &[Role]); 11] = [
    ("root", 1, &[]),
    ("requester", 2, &[Role::Requester]),
    ("author", 3, &[Role::Author]),
    ("evaluator", 4, &[Role::Evaluator]),
    ("approver", 5, &[Role::Approver]),
    ("executor", 6, &[Role::Executor]),
    ("outsider", 7, &[]),
    ("eval-appr", 8, &[Role::Evaluator, Role::Approver]),
    ("auth-appr", 9, &[Role::Author, Role::Approver]),
    ("appr-exec", 10, &[Role::Approver, Role::Executor]),
    ("eval-exec", 11, &[Role::Evaluator, Role::Executor]),
];

fn secret(name: &str) -> [u8; 32] {
    [ACCOUNTS.iter().find(|(id, ..)| *id == name).unwrap().1; 32]
}

fn policy() -> AttestPolicy {
    let mut keys = BTreeMap::new();
    let mut grants = Vec::new();
    for (name, _, roles) in ACCOUNTS {
        keys.insert(name.to_string(), public_key(&secret(name)).unwrap());
        for role in roles {
            grants.push(Grant {
                delegate: name.to_string(),
                role: *role,
                grantor: "root".to_string(),
                // The approver grant ends first, so a test can outlive it.
                expires: if name == "approver" { 20 } else { 100 },
            });
        }
    }
    AttestPolicy { keys, grants }
}

fn registry() -> AttestRegistry {
    AttestRegistry::new(CHAIN, GENESIS, AUDIENCE, policy()).unwrap()
}

fn signed(signer: &str, nonce: u8, claim: Claim) -> Attestation {
    let mut att = Attestation {
        version: ATTEST_VERSION,
        scheme: ATTEST_SCHEME_ED25519,
        chain_id: CHAIN.to_string(),
        genesis: GENESIS,
        audience: AUDIENCE.to_string(),
        signer: signer.to_string(),
        nonce: [nonce; 32],
        not_before: 0,
        expires: 50,
        claim,
        signature: [0; 64],
    };
    sign_attestation(&mut att, &secret(signer)).unwrap();
    att
}

fn evaluation(artifact: [u8; 32], passed: bool) -> Claim {
    Claim::Evaluation {
        artifact,
        suite: [0x51; 32],
        environment: [0xE1; 32],
        evidence: [0xEE; 32],
        passed,
    }
}

struct Flow {
    reg: AttestRegistry,
    request: [u8; 32],
    proposal: [u8; 32],
    evaluation: [u8; 32],
    approval: [u8; 32],
}

impl Flow {
    fn approve(&mut self, signer: &str, nonce: u8, cost: u64) -> [u8; 32] {
        let claim = Claim::Approval {
            action: ACTION,
            artifact: ARTIFACT,
            proposal: self.proposal,
            evaluation: self.evaluation,
            policy: self.reg.policy_digest(),
            cost,
        };
        self.reg.admit(&signed(signer, nonce, claim), H).unwrap()
    }
}

/// Request, proposal, evaluation and approval of `ARTIFACT`, all admitted.
fn flow_with(author: &str, evaluator: &str, approver: &str, passed: bool) -> Flow {
    let mut reg = registry();
    let request = reg
        .admit(&signed("requester", 1, Claim::Request { task: [0x7A; 32], budget: BUDGET }), H)
        .unwrap();
    let proposal = reg
        .admit(&signed(author, 1, Claim::Artifact { request, artifact: ARTIFACT }), H)
        .unwrap();
    let evaluation = reg.admit(&signed(evaluator, 2, evaluation(ARTIFACT, passed)), H).unwrap();
    let mut flow = Flow { reg, request, proposal, evaluation, approval: [0; 32] };
    flow.approval = flow.approve(approver, 3, 2);
    flow
}

fn flow() -> Flow {
    flow_with("author", "evaluator", "approver", true)
}

fn execution(signer: &str, nonce: u8, approval: [u8; 32]) -> Attestation {
    signed(signer, nonce, Claim::Execution { approval, action: ACTION, artifact: ARTIFACT })
}

/// Admit an execution of `approval` signed by `signer`.
fn run_as(reg: &mut AttestRegistry, signer: &str, nonce: u8, approval: [u8; 32], height: u64) -> Result<(), ChainError> {
    reg.admit(&execution(signer, nonce, approval), height).map(|_| ())
}

fn run(reg: &mut AttestRegistry, approval: [u8; 32], height: u64) -> Result<(), ChainError> {
    run_as(reg, "executor", 100, approval, height)
}

fn refused(reason: &'static str) -> Result<(), ChainError> {
    Err(ChainError::Attest(reason))
}

#[test]
fn full_flow_yields_one_receipt_that_names_the_executor() {
    let Flow { mut reg, request, evaluation, approval, .. } = flow();
    let signed_execution = execution("executor", 100, approval);
    let (receipt, applied) = reg.execute(&signed_execution, H, |r| Ok(r.leaf)).unwrap();
    assert_eq!(applied, 5);
    assert_eq!(receipt.execution, signed_execution.id());
    assert_eq!(receipt.executor, "executor");
    assert_eq!((receipt.evaluation, receipt.request, receipt.cost), (evaluation, request, 2));
    assert_eq!(reg.receipt(&approval), Some(&receipt));
    assert_eq!(reg.spent(&request), 2);

    let status = reg.status(&approval, H).unwrap();
    assert!(status.signature_valid && status.authority_confirmed);
    assert_eq!((status.included, status.execution_recorded), (3, Some(5)));
    assert!(!status.evidence_referenced);
    assert!(reg.status(&evaluation, H).unwrap().evidence_referenced);
    let executed = reg.status(&receipt.execution, H).unwrap();
    assert!(executed.authority_confirmed);
    assert_eq!((executed.included, executed.execution_recorded), (4, Some(5)));

    for leaf in [status.included, executed.included, receipt.leaf] {
        let (proof, record, root) = reg.inclusion_proof(leaf).unwrap();
        mmr::verify(&record, &proof, reg.count(), &root).unwrap();
        let mut other = record;
        other[0] ^= 1;
        assert!(mmr::verify(&other, &proof, reg.count(), &root).is_err());
    }
    let (_, record, _) = reg.inclusion_proof(receipt.leaf).unwrap();
    assert_eq!(record, receipt.record());
    let mut renamed = receipt.clone();
    renamed.executor = "approver".to_string();
    assert_ne!(renamed.record(), receipt.record());
}

#[test]
fn integrity_every_field_is_covered_by_the_signature() {
    let base = signed("approver", 3, Claim::Approval {
        action: ACTION,
        artifact: ARTIFACT,
        proposal: [3; 32],
        evaluation: [1; 32],
        policy: [2; 32],
        cost: 7,
    });
    let flip = |pick: fn(&mut Claim) -> &mut [u8; 32]| move |a: &mut Attestation| pick(&mut a.claim)[0] ^= 1;
    let edits: Vec<Box<dyn Fn(&mut Attestation)>> = vec![
        Box::new(|a| a.nonce[0] ^= 1),
        Box::new(|a| a.not_before = 1),
        Box::new(|a| a.expires = 51),
        Box::new(|a| a.signer = "eval-appr".to_string()),
        Box::new(|a| a.signature[0] ^= 1),
        Box::new(flip(|c| match c {
            Claim::Approval { action, .. } => action,
            _ => unreachable!(),
        })),
        Box::new(flip(|c| match c {
            Claim::Approval { artifact, .. } => artifact,
            _ => unreachable!(),
        })),
        Box::new(flip(|c| match c {
            Claim::Approval { proposal, .. } => proposal,
            _ => unreachable!(),
        })),
        Box::new(flip(|c| match c {
            Claim::Approval { evaluation, .. } => evaluation,
            _ => unreachable!(),
        })),
        Box::new(flip(|c| match c {
            Claim::Approval { policy, .. } => policy,
            _ => unreachable!(),
        })),
        Box::new(|a| {
            if let Claim::Approval { cost, .. } = &mut a.claim {
                *cost = 6
            }
        }),
        Box::new(|a| a.claim = Claim::Request { task: ACTION, budget: 0 }),
    ];
    for (i, edit) in edits.iter().enumerate() {
        let mut att = base.clone();
        edit(&mut att);
        assert_ne!(att, base, "edit {i}");
        assert_eq!(registry().admit(&att, H), Err(ChainError::UnverifiedSignature), "edit {i}");
    }
    let mut eval = signed("evaluator", 3, evaluation(ARTIFACT, false));
    if let Claim::Evaluation { passed, .. } = &mut eval.claim {
        *passed = true;
    }
    assert_eq!(registry().admit(&eval, H), Err(ChainError::UnverifiedSignature));
    registry().admit(&base, H).unwrap();

    // An execution signed for one approval, action or artifact is not another.
    let Flow { mut reg, approval, .. } = flow();
    for field in 0..3 {
        let mut att = execution("executor", 100, approval);
        if let Claim::Execution { approval, action, artifact } = &mut att.claim {
            [approval, action, artifact][field][0] ^= 1;
        }
        assert_eq!(reg.admit(&att, H), Err(ChainError::UnverifiedSignature), "field {field}");
    }
    let mut other_signer = execution("executor", 100, approval);
    other_signer.signer = "appr-exec".to_string();
    assert_eq!(reg.admit(&other_signer, H), Err(ChainError::UnverifiedSignature));
    assert_eq!(reg.receipt(&approval), None);
}

#[test]
fn context_a_signature_for_another_domain_is_rejected() {
    let edits: Vec<Box<dyn Fn(&mut Attestation)>> = vec![
        Box::new(|a| a.chain_id = "arkhe-testnet".to_string()),
        Box::new(|a| a.genesis = [8; 32]),
        Box::new(|a| a.audience = "treasury".to_string()),
    ];
    for edit in &edits {
        let mut att = signed("requester", 1, Claim::Request { task: [1; 32], budget: 1 });
        edit(&mut att);
        sign_attestation(&mut att, &secret("requester")).unwrap();
        assert_eq!(registry().admit(&att, H), Err(ChainError::Attest("domain")));

        let Flow { mut reg, approval, .. } = flow();
        let mut att = execution("executor", 100, approval);
        edit(&mut att);
        sign_attestation(&mut att, &secret("executor")).unwrap();
        assert_eq!(reg.admit(&att, H), Err(ChainError::Attest("domain")));
    }
    let mut att = signed("requester", 1, Claim::Request { task: [1; 32], budget: 1 });
    att.version = 2;
    sign_attestation(&mut att, &secret("requester")).unwrap();
    assert_eq!(registry().admit(&att, H), Err(ChainError::Attest("version")));
    att.version = ATTEST_VERSION;
    att.scheme = 2;
    sign_attestation(&mut att, &secret("requester")).unwrap();
    assert_eq!(registry().admit(&att, H), Err(ChainError::Attest("version")));
}

#[test]
fn single_use_second_execution_is_rejected() {
    let Flow { mut reg, request, approval, .. } = flow();
    run(&mut reg, approval, H).unwrap();
    let root = reg.root().unwrap();
    // The same signed execution again, and a fresh one from the same executor.
    assert_eq!(run(&mut reg, approval, H), refused("replay"));
    assert_eq!(run_as(&mut reg, "executor", 101, approval, H), refused("consumed"));
    assert_eq!(run_as(&mut reg, "appr-exec", 1, approval, H), refused("consumed"));
    assert_eq!((reg.root().unwrap(), reg.spent(&request)), (root, 2));
}

#[test]
fn single_use_concurrent_executions_produce_one_effect() {
    let Flow { reg, approval, .. } = flow();
    let reg = Arc::new(Mutex::new(reg));
    let effects = Arc::new(AtomicUsize::new(0));
    let handles: Vec<_> = (0..16u8)
        .map(|nonce| {
            let (reg, effects) = (reg.clone(), effects.clone());
            std::thread::spawn(move || {
                let signed_execution = execution("executor", 100 + nonce, approval);
                reg.lock()
                    .unwrap()
                    .execute(&signed_execution, H, |_| {
                        effects.fetch_add(1, Ordering::SeqCst);
                        Ok(())
                    })
                    .is_ok()
            })
        })
        .collect();
    let granted = handles.into_iter().map(|h| h.join().unwrap()).filter(|ok| *ok).count();
    assert_eq!(granted, 1);
    assert_eq!(effects.load(Ordering::SeqCst), 1);
}

#[test]
fn single_use_failed_effect_leaves_the_approval_unused() {
    let Flow { mut reg, request, approval, .. } = flow();
    let (root, count) = (reg.root().unwrap(), reg.count());
    let signed_execution = execution("executor", 100, approval);
    let failed = reg.execute(&signed_execution, H, |_| Err::<(), _>(ChainError::Busy));
    assert_eq!(failed.unwrap_err(), ChainError::Busy);
    assert_eq!((reg.root().unwrap(), reg.count(), reg.spent(&request)), (root, count, 0));
    assert_eq!(reg.status(&approval, H).unwrap().execution_recorded, None);
    assert_eq!(reg.status(&signed_execution.id(), H), None);
    // Nothing was stored, so the same signed execution is still usable.
    reg.admit(&signed_execution, H).unwrap();
}

#[test]
fn authority_valid_key_without_role_cannot_approve_or_execute() {
    let Flow { mut reg, approval, .. } = flow_with("author", "evaluator", "outsider", true);
    assert!(!reg.status(&approval, H).unwrap().authority_confirmed);
    assert_eq!(run(&mut reg, approval, H), refused("authority"));

    // A valid approval, executed by accounts that hold other roles or none.
    let Flow { mut reg, approval, .. } = flow();
    for signer in ["outsider", "requester", "author", "root"] {
        assert_eq!(run_as(&mut reg, signer, 100, approval, H), refused("authority"), "{signer}");
    }
    assert_eq!(reg.receipt(&approval), None);
    let plain = signed("executor", 100, Claim::Request { task: [1; 32], budget: 1 });
    assert_eq!(reg.execute(&plain, H, |_| Ok(())).unwrap_err(), ChainError::Attest("kind"));
    run(&mut reg, approval, H).unwrap();
}

#[test]
fn authority_expired_grant_and_expired_statements_are_rejected() {
    let Flow { mut reg, approval, .. } = flow();
    // The approver grant ends at 20; every statement ends at 50.
    assert_eq!(run(&mut reg, approval, 21), refused("authority"));
    assert_eq!(run(&mut reg, approval, 51), refused("window"));
    let mut late = execution("executor", 100, approval);
    late.not_before = 15;
    sign_attestation(&mut late, &secret("executor")).unwrap();
    assert_eq!(reg.admit(&late, 14), Err(ChainError::Attest("window")));
    run(&mut reg, approval, 20).unwrap();

    // A request, a proposal or an evaluation that ended before the execution.
    for stale in 0..3 {
        let mut reg = registry();
        let ends = |index| if index == stale { 12 } else { 50 };
        let mut request = signed("requester", 1, Claim::Request { task: [1; 32], budget: BUDGET });
        request.expires = ends(0);
        sign_attestation(&mut request, &secret("requester")).unwrap();
        let request = reg.admit(&request, H).unwrap();
        let mut proposal = signed("author", 1, Claim::Artifact { request, artifact: ARTIFACT });
        proposal.expires = ends(1);
        sign_attestation(&mut proposal, &secret("author")).unwrap();
        let proposal = reg.admit(&proposal, H).unwrap();
        let mut evaluated = signed("evaluator", 1, evaluation(ARTIFACT, true));
        evaluated.expires = ends(2);
        sign_attestation(&mut evaluated, &secret("evaluator")).unwrap();
        let evaluation = reg.admit(&evaluated, H).unwrap();
        let mut flow = Flow { reg, request, proposal, evaluation, approval: [0; 32] };
        let approval = flow.approve("approver", 1, 1);
        assert_eq!(run(&mut flow.reg, approval, 13), refused("window"), "stale {stale}");
        run(&mut flow.reg, approval, 12).unwrap();
    }
}

#[test]
fn authority_revoked_grant_stops_later_executions() {
    let cases = [
        ("approver", Role::Approver, "authority"),
        ("evaluator", Role::Evaluator, "authority"),
        ("executor", Role::Executor, "authority"),
        ("author", Role::Author, "link"),
        ("requester", Role::Requester, "link"),
    ];
    for (delegate, role, expected) in cases {
        let Flow { mut reg, approval, .. } = flow();
        let revoke = |signer: &str| {
            signed(signer, 9, Claim::Revocation { delegate: delegate.to_string(), role })
        };
        assert_eq!(reg.admit(&revoke("outsider"), 12), Err(ChainError::Attest("authority")));
        assert_eq!(reg.admit(&revoke(delegate), 12), Err(ChainError::Attest("authority")));
        reg.admit(&revoke("root"), 12).unwrap();
        assert_eq!(run(&mut reg, approval, 12), refused(expected), "{delegate}");
        assert_eq!(run(&mut reg, approval, 13), refused(expected), "{delegate}");
    }
    let mut reg = registry();
    let unknown = signed("root", 9, Claim::Revocation { delegate: "outsider".to_string(), role: Role::Approver });
    assert_eq!(reg.admit(&unknown, H), Err(ChainError::Attest("authority")));
}

#[test]
fn binding_approval_of_a_does_not_execute_b() {
    let mut flow = flow();
    let (approval, evaluation, proposal, request) = (flow.approval, flow.evaluation, flow.proposal, flow.request);
    let other = [0xB2; 32];
    let policy = flow.reg.policy_digest();
    let reg = &mut flow.reg;

    let wrong = |nonce, claim| signed("executor", nonce, claim);
    let wrong_artifact = wrong(100, Claim::Execution { approval, action: ACTION, artifact: other });
    assert_eq!(reg.admit(&wrong_artifact, H), Err(ChainError::Attest("artifact")));
    let wrong_action = wrong(100, Claim::Execution { approval, action: other, artifact: ARTIFACT });
    assert_eq!(reg.admit(&wrong_action, H), Err(ChainError::Attest("action")));
    assert_eq!(run(reg, evaluation, H), refused("kind"));
    assert_eq!(run(reg, other, H), refused("unknown"));

    // Approvals that name the wrong thing in one field each.
    let cases: [(Claim, &str); 6] = [
        (Claim::Approval { action: ACTION, artifact: other, proposal, evaluation, policy, cost: 1 }, "link"),
        (Claim::Approval { action: ACTION, artifact: ARTIFACT, proposal, evaluation, policy: [0; 32], cost: 1 }, "policy"),
        (Claim::Approval { action: ACTION, artifact: ARTIFACT, proposal, evaluation: approval, policy, cost: 1 }, "link"),
        (Claim::Approval { action: ACTION, artifact: ARTIFACT, proposal, evaluation: [3; 32], policy, cost: 1 }, "link"),
        (Claim::Approval { action: ACTION, artifact: ARTIFACT, proposal: [4; 32], evaluation, policy, cost: 1 }, "link"),
        (Claim::Approval { action: ACTION, artifact: ARTIFACT, proposal: request, evaluation, policy, cost: 1 }, "link"),
    ];
    for (index, (claim, expected)) in cases.into_iter().enumerate() {
        let artifact = match &claim {
            Claim::Approval { artifact, .. } => *artifact,
            _ => unreachable!(),
        };
        let id = reg.admit(&signed("approver", 10 + index as u8, claim), H).unwrap();
        let attempt = wrong(110 + index as u8, Claim::Execution { approval: id, action: ACTION, artifact });
        assert_eq!(reg.admit(&attempt, H), Err(ChainError::Attest(expected)), "case {index}");
    }

    // A proposal of another artifact does not carry an approval of this one.
    let elsewhere = reg
        .admit(&signed("author", 2, Claim::Artifact { request, artifact: other }), H)
        .unwrap();
    let claim = Claim::Approval { action: ACTION, artifact: ARTIFACT, proposal: elsewhere, evaluation, policy, cost: 1 };
    let id = reg.admit(&signed("approver", 30, claim), H).unwrap();
    assert_eq!(run_as(reg, "executor", 130, id, H), refused("link"));

    run(reg, approval, H).unwrap();
}

#[test]
fn binding_failed_evaluation_does_not_execute() {
    let Flow { mut reg, approval, .. } = flow_with("author", "evaluator", "approver", false);
    assert_eq!(run(&mut reg, approval, H), refused("evaluation"));
}

#[test]
fn separation_no_account_holds_two_seats_of_one_execution() {
    // (author, evaluator, approver, executor)
    let cases = [
        ("author", "eval-appr", "eval-appr", "executor"),
        ("auth-appr", "evaluator", "auth-appr", "executor"),
        ("author", "evaluator", "appr-exec", "appr-exec"),
        ("author", "eval-exec", "approver", "eval-exec"),
    ];
    for (author, evaluator, approver, executor) in cases {
        let Flow { mut reg, approval, .. } = flow_with(author, evaluator, approver, true);
        assert!(reg.status(&approval, H).unwrap().authority_confirmed);
        assert_eq!(
            run_as(&mut reg, executor, 100, approval, H),
            refused("separation"),
            "{author} {evaluator} {approver} {executor}"
        );
        assert_eq!(reg.receipt(&approval), None);
    }
    // The author may execute its own approved proposal.
    let mut policy = policy();
    policy.grants.push(Grant {
        delegate: "author".to_string(),
        role: Role::Executor,
        grantor: "root".to_string(),
        expires: 100,
    });
    let mut flow = flow();
    let mut reg = AttestRegistry::new(CHAIN, GENESIS, AUDIENCE, policy).unwrap();
    let request = reg
        .admit(&signed("requester", 1, Claim::Request { task: [1; 32], budget: BUDGET }), H)
        .unwrap();
    let proposal = reg
        .admit(&signed("author", 1, Claim::Artifact { request, artifact: ARTIFACT }), H)
        .unwrap();
    let evaluation = reg.admit(&signed("evaluator", 1, evaluation(ARTIFACT, true)), H).unwrap();
    flow = Flow { reg, request, proposal, evaluation, approval: flow.approval };
    let approval = flow.approve("approver", 1, 1);
    run_as(&mut flow.reg, "author", 100, approval, H).unwrap();
    assert_eq!(flow.reg.receipt(&approval).unwrap().executor, "author");
}

#[test]
fn budget_executions_cannot_spend_more_than_the_request_allows() {
    let mut flow = flow();
    let request = flow.request;
    // BUDGET is 5. The first approval costs 2.
    run(&mut flow.reg, flow.approval, H).unwrap();
    let four = flow.approve("approver", 10, 4);
    let three = flow.approve("approver", 11, 3);
    let huge = flow.approve("approver", 12, u64::MAX);
    let free = flow.approve("approver", 13, 0);
    assert_eq!(run_as(&mut flow.reg, "executor", 110, four, H), refused("budget"));
    assert_eq!(run_as(&mut flow.reg, "executor", 111, huge, H), refused("budget"));
    assert_eq!(flow.reg.spent(&request), 2);
    run_as(&mut flow.reg, "executor", 112, three, H).unwrap();
    assert_eq!(flow.reg.spent(&request), 5);
    assert_eq!(flow.reg.receipt(&three).unwrap().cost, 3);
    // The refused approval stays unused, and stays over budget.
    assert_eq!(run_as(&mut flow.reg, "executor", 113, four, H), refused("budget"));
    run_as(&mut flow.reg, "executor", 114, free, H).unwrap();
    assert_eq!(flow.reg.spent(&request), 5);

    // Another request has its own budget.
    let other = flow
        .reg
        .admit(&signed("requester", 2, Claim::Request { task: [2; 32], budget: 1 }), H)
        .unwrap();
    assert_eq!(flow.reg.spent(&other), 0);
}

#[test]
fn traceability_a_false_signed_statement_gets_only_the_proven_states() {
    let mut reg = registry();
    // Nobody ran anything. The signer has a key and no evaluator role.
    let id = reg.admit(&signed("outsider", 1, evaluation(ARTIFACT, true)), H).unwrap();
    let status = reg.status(&id, H).unwrap();
    assert!(status.signature_valid);
    assert!(!status.authority_confirmed);
    assert_eq!(status.included, 0);
    assert_eq!(status.execution_recorded, None);
    assert!(status.evidence_referenced);
    assert_eq!(reg.status(&[0; 32], H), None);
}

#[test]
fn limits_replay_window_unknown_key_and_quota() {
    let mut reg = registry();
    let att = signed("requester", 1, Claim::Request { task: [1; 32], budget: 1 });
    assert_eq!(reg.admit(&att, 51), Err(ChainError::Attest("window")));
    reg.admit(&att, H).unwrap();
    assert_eq!(reg.admit(&att, H), Err(ChainError::Attest("replay")));
    let same_nonce = signed("requester", 1, Claim::Request { task: [2; 32], budget: 1 });
    assert_eq!(reg.admit(&same_nonce, H), Err(ChainError::Attest("replay")));

    let mut stranger = signed("requester", 2, Claim::Request { task: [1; 32], budget: 1 });
    stranger.signer = "nobody".to_string();
    assert_eq!(reg.admit(&stranger, H), Err(ChainError::UnverifiedSignature));

    for nonce in 2..=ATTEST_SIGNER_QUOTA as u8 {
        reg.admit(&signed("requester", nonce, Claim::Request { task: [1; 32], budget: 1 }), H).unwrap();
    }
    let over = signed("requester", 200, Claim::Request { task: [1; 32], budget: 1 });
    assert_eq!(reg.admit(&over, H), Err(ChainError::Attest("quota")));
    reg.admit(&signed("author", 1, Claim::Artifact { request: [0; 32], artifact: ARTIFACT }), H).unwrap();
}
