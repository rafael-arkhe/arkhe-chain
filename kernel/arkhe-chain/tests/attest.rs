use std::collections::BTreeMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use arkhe_chain::{
    public_key, sign_attestation, AttestPolicy, AttestRegistry, Attestation, ChainError, Claim,
    Grant, Role, ATTEST_SCHEME_ED25519, ATTEST_SIGNER_QUOTA, ATTEST_VERSION,
};
use arkhe_verify_core::rbb::mmr;

const CHAIN: &str = "arkhe-chain";
const AUDIENCE: &str = "shadow-optimizer";
const GENESIS: [u8; 32] = [9; 32];
const ARTIFACT: [u8; 32] = [0xA1; 32];
const ACTION: [u8; 32] = [0xAC; 32];
const H: u64 = 10;

fn secret(name: &str) -> [u8; 32] {
    let tag = match name {
        "root" => 1,
        "requester" => 2,
        "author" => 3,
        "evaluator" => 4,
        "approver" => 5,
        "outsider" => 6,
        "both" => 7,
        other => panic!("{other}"),
    };
    [tag; 32]
}

fn policy() -> AttestPolicy {
    let mut keys = BTreeMap::new();
    for name in [
        "root",
        "requester",
        "author",
        "evaluator",
        "approver",
        "outsider",
        "both",
    ] {
        keys.insert(name.to_string(), public_key(&secret(name)).unwrap());
    }
    let grant = |delegate: &str, role, expires| Grant {
        delegate: delegate.to_string(),
        role,
        grantor: "root".to_string(),
        expires,
    };
    AttestPolicy {
        keys,
        grants: vec![
            grant("requester", Role::Requester, 100),
            grant("author", Role::Author, 100),
            grant("evaluator", Role::Evaluator, 100),
            grant("approver", Role::Approver, 20),
            grant("both", Role::Evaluator, 100),
            grant("both", Role::Approver, 100),
        ],
    }
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
    evaluation: [u8; 32],
    approval: [u8; 32],
}

/// Request, proposal, evaluation and approval of `ARTIFACT`, all admitted.
fn flow_with(evaluator: &str, approver: &str, passed: bool) -> Flow {
    let mut reg = registry();
    let request = reg
        .admit(
            &signed(
                "requester",
                1,
                Claim::Request {
                    task: [0x7A; 32],
                    budget: 5,
                },
            ),
            H,
            None,
        )
        .unwrap();
    reg.admit(
        &signed(
            "author",
            1,
            Claim::Artifact {
                request,
                artifact: ARTIFACT,
            },
        ),
        H,
        None,
    )
    .unwrap();
    let evaluation = reg
        .admit(&signed(evaluator, 1, evaluation(ARTIFACT, passed)), H, None)
        .unwrap();
    let policy = reg.policy_digest();
    let approval = reg
        .admit(
            &signed(
                approver,
                2,
                Claim::Approval {
                    action: ACTION,
                    artifact: ARTIFACT,
                    evaluation,
                    policy,
                },
            ),
            H,
            None,
        )
        .unwrap();
    Flow {
        reg,
        evaluation,
        approval,
    }
}

fn flow() -> Flow {
    flow_with("evaluator", "approver", true)
}

fn run(reg: &mut AttestRegistry, approval: &[u8; 32], height: u64) -> Result<(), ChainError> {
    reg.execute(approval, &ACTION, &ARTIFACT, height, None, |_| Ok(()))
        .map(|_| ())
}

#[test]
fn full_flow_yields_one_receipt_with_inclusion_proofs() {
    let Flow {
        mut reg,
        evaluation,
        approval,
    } = flow();
    let (receipt, applied) = reg
        .execute(&approval, &ACTION, &ARTIFACT, H, None, |r| Ok(r.leaf))
        .unwrap();
    assert_eq!(applied, 4);
    assert_eq!(receipt.evaluation, evaluation);
    assert_eq!(reg.receipt(&approval), Some(&receipt));

    let status = reg.status(&approval, H).unwrap();
    assert!(status.signature_valid && status.authority_confirmed);
    assert_eq!(status.included, 3);
    assert_eq!(status.execution_recorded, Some(4));
    assert!(!status.evidence_referenced);
    assert!(reg.status(&evaluation, H).unwrap().evidence_referenced);

    for leaf in [status.included, receipt.leaf] {
        let (proof, record, root) = reg.inclusion_proof(leaf).unwrap();
        mmr::verify(&record, &proof, reg.count(), &root).unwrap();
        let mut other = record;
        other[0] ^= 1;
        assert!(mmr::verify(&other, &proof, reg.count(), &root).is_err());
    }
    let (_, record, _) = reg.inclusion_proof(receipt.leaf).unwrap();
    assert_eq!(record, receipt.record());
}

#[test]
fn integrity_every_field_is_covered_by_the_signature() {
    let base = signed(
        "approver",
        3,
        Claim::Approval {
            action: ACTION,
            artifact: ARTIFACT,
            evaluation: [1; 32],
            policy: [2; 32],
        },
    );
    let edits: Vec<Box<dyn Fn(&mut Attestation)>> = vec![
        Box::new(|a| a.nonce[0] ^= 1),
        Box::new(|a| a.not_before = 1),
        Box::new(|a| a.expires = 51),
        Box::new(|a| a.signer = "both".to_string()),
        Box::new(|a| a.signature[0] ^= 1),
        Box::new(|a| {
            if let Claim::Approval { action, .. } = &mut a.claim {
                action[0] ^= 1
            }
        }),
        Box::new(|a| {
            if let Claim::Approval { artifact, .. } = &mut a.claim {
                artifact[0] ^= 1
            }
        }),
        Box::new(|a| {
            if let Claim::Approval { evaluation, .. } = &mut a.claim {
                evaluation[0] ^= 1
            }
        }),
        Box::new(|a| {
            if let Claim::Approval { policy, .. } = &mut a.claim {
                policy[0] ^= 1
            }
        }),
        Box::new(|a| {
            a.claim = Claim::Request {
                task: ACTION,
                budget: 0,
            }
        }),
    ];
    for (i, edit) in edits.iter().enumerate() {
        let mut att = base.clone();
        edit(&mut att);
        assert_ne!(att, base, "edit {i}");
        assert_eq!(
            registry().admit(&att, H, None),
            Err(ChainError::UnverifiedSignature),
            "edit {i}"
        );
    }
    let mut eval = signed("evaluator", 3, evaluation(ARTIFACT, false));
    if let Claim::Evaluation { passed, .. } = &mut eval.claim {
        *passed = true;
    }
    assert_eq!(
        registry().admit(&eval, H, None),
        Err(ChainError::UnverifiedSignature)
    );
    registry().admit(&base, H, None).unwrap();
}

#[test]
fn context_a_signature_for_another_domain_is_rejected() {
    let edits: Vec<Box<dyn Fn(&mut Attestation)>> = vec![
        Box::new(|a| a.chain_id = "arkhe-testnet".to_string()),
        Box::new(|a| a.genesis = [8; 32]),
        Box::new(|a| a.audience = "treasury".to_string()),
    ];
    for edit in &edits {
        let mut att = signed(
            "requester",
            1,
            Claim::Request {
                task: [1; 32],
                budget: 1,
            },
        );
        edit(&mut att);
        sign_attestation(&mut att, &secret("requester")).unwrap();
        assert_eq!(
            registry().admit(&att, H, None),
            Err(ChainError::Attest("domain"))
        );
    }
    let mut att = signed(
        "requester",
        1,
        Claim::Request {
            task: [1; 32],
            budget: 1,
        },
    );
    att.version = 2;
    sign_attestation(&mut att, &secret("requester")).unwrap();
    assert_eq!(
        registry().admit(&att, H, None),
        Err(ChainError::Attest("version"))
    );
    att.version = ATTEST_VERSION;
    att.scheme = 2;
    sign_attestation(&mut att, &secret("requester")).unwrap();
    assert_eq!(
        registry().admit(&att, H, None),
        Err(ChainError::Attest("version"))
    );
}

#[test]
fn single_use_second_execution_is_rejected() {
    let Flow {
        mut reg, approval, ..
    } = flow();
    run(&mut reg, &approval, H).unwrap();
    let root = reg.root().unwrap();
    assert_eq!(
        run(&mut reg, &approval, H),
        Err(ChainError::Attest("consumed"))
    );
    assert_eq!(reg.root().unwrap(), root);
}

#[test]
fn single_use_concurrent_executions_produce_one_effect() {
    let Flow { reg, approval, .. } = flow();
    let reg = Arc::new(Mutex::new(reg));
    let effects = Arc::new(AtomicUsize::new(0));
    let handles: Vec<_> = (0..16)
        .map(|_| {
            let (reg, effects) = (reg.clone(), effects.clone());
            std::thread::spawn(move || {
                reg.lock()
                    .unwrap()
                    .execute(&approval, &ACTION, &ARTIFACT, H, None, |_| {
                        effects.fetch_add(1, Ordering::SeqCst);
                        Ok(())
                    })
                    .is_ok()
            })
        })
        .collect();
    let granted = handles
        .into_iter()
        .map(|h| h.join().unwrap())
        .filter(|ok| *ok)
        .count();
    assert_eq!(granted, 1);
    assert_eq!(effects.load(Ordering::SeqCst), 1);
}

#[test]
fn single_use_failed_effect_leaves_the_approval_unused() {
    let Flow {
        mut reg, approval, ..
    } = flow();
    let (root, count) = (reg.root().unwrap(), reg.count());
    let failed = reg.execute(&approval, &ACTION, &ARTIFACT, H, None, |_| {
        Err::<(), _>(ChainError::Busy)
    });
    assert_eq!(failed.unwrap_err(), ChainError::Busy);
    assert_eq!((reg.root().unwrap(), reg.count()), (root, count));
    assert_eq!(reg.status(&approval, H).unwrap().execution_recorded, None);
    run(&mut reg, &approval, H).unwrap();
}

#[test]
fn authority_valid_key_without_role_cannot_approve() {
    let Flow {
        mut reg, approval, ..
    } = flow_with("evaluator", "outsider", true);
    assert!(!reg.status(&approval, H).unwrap().authority_confirmed);
    assert_eq!(
        run(&mut reg, &approval, H),
        Err(ChainError::Attest("authority"))
    );
}

#[test]
fn authority_expired_grant_and_expired_approval_are_rejected() {
    let Flow {
        mut reg, approval, ..
    } = flow();
    // The approver grant ends at 20; the approval itself ends at 50.
    assert_eq!(
        run(&mut reg, &approval, 21),
        Err(ChainError::Attest("authority"))
    );
    assert_eq!(
        run(&mut reg, &approval, 51),
        Err(ChainError::Attest("window"))
    );
    run(&mut reg, &approval, 20).unwrap();
}

#[test]
fn authority_revoked_grant_stops_later_executions() {
    for (delegate, role) in [
        ("approver", Role::Approver),
        ("evaluator", Role::Evaluator),
        ("author", Role::Author),
    ] {
        let Flow {
            mut reg, approval, ..
        } = flow();
        let revoke = |signer: &str| {
            signed(
                signer,
                9,
                Claim::Revocation {
                    delegate: delegate.to_string(),
                    role,
                },
            )
        };
        assert_eq!(
            reg.admit(&revoke("outsider"), 12, None),
            Err(ChainError::Attest("authority"))
        );
        assert_eq!(
            reg.admit(&revoke(delegate), 12, None),
            Err(ChainError::Attest("authority"))
        );
        reg.admit(&revoke("root"), 12, None).unwrap();
        let expected = if role == Role::Author {
            "link"
        } else {
            "authority"
        };
        assert_eq!(
            run(&mut reg, &approval, 12),
            Err(ChainError::Attest(expected))
        );
        assert_eq!(
            run(&mut reg, &approval, 13),
            Err(ChainError::Attest(expected))
        );
    }
    let mut reg = registry();
    let unknown = signed(
        "root",
        9,
        Claim::Revocation {
            delegate: "outsider".to_string(),
            role: Role::Approver,
        },
    );
    assert_eq!(
        reg.admit(&unknown, H, None),
        Err(ChainError::Attest("authority"))
    );
}

#[test]
fn binding_approval_of_a_does_not_execute_b() {
    let Flow {
        mut reg,
        approval,
        evaluation,
    } = flow();
    let other = [0xB2; 32];
    let wrong_artifact = reg.execute(&approval, &ACTION, &other, H, None, |_| Ok(()));
    assert_eq!(wrong_artifact.unwrap_err(), ChainError::Attest("artifact"));
    let wrong_action = reg.execute(&approval, &other, &ARTIFACT, H, None, |_| Ok(()));
    assert_eq!(wrong_action.unwrap_err(), ChainError::Attest("action"));
    assert_eq!(
        run(&mut reg, &evaluation, H),
        Err(ChainError::Attest("kind"))
    );
    assert_eq!(run(&mut reg, &other, H), Err(ChainError::Attest("unknown")));

    // An approval of B that cites the evaluation of A.
    let policy = reg.policy_digest();
    let crossed = reg
        .admit(
            &signed(
                "approver",
                4,
                Claim::Approval {
                    action: ACTION,
                    artifact: other,
                    evaluation,
                    policy,
                },
            ),
            H,
            None,
        )
        .unwrap();
    let out = reg.execute(&crossed, &ACTION, &other, H, None, |_| Ok(()));
    assert_eq!(out.unwrap_err(), ChainError::Attest("link"));

    // An approval that cites another policy, and one that cites no evaluation.
    for (nonce, evaluation, policy, expected) in [
        (5, evaluation, [0; 32], "policy"),
        (6, approval, policy, "link"),
        (7, [3; 32], policy, "link"),
    ] {
        let claim = Claim::Approval {
            action: ACTION,
            artifact: ARTIFACT,
            evaluation,
            policy,
        };
        let id = reg
            .admit(&signed("approver", nonce, claim), H, None)
            .unwrap();
        assert_eq!(run(&mut reg, &id, H), Err(ChainError::Attest(expected)));
    }
    run(&mut reg, &approval, H).unwrap();
}

#[test]
fn binding_failed_evaluation_and_missing_proposal_do_not_execute() {
    let Flow {
        mut reg, approval, ..
    } = flow_with("evaluator", "approver", false);
    assert_eq!(
        run(&mut reg, &approval, H),
        Err(ChainError::Attest("evaluation"))
    );

    let mut reg = registry();
    let evaluation = reg
        .admit(&signed("evaluator", 1, evaluation(ARTIFACT, true)), H, None)
        .unwrap();
    let policy = reg.policy_digest();
    let claim = Claim::Approval {
        action: ACTION,
        artifact: ARTIFACT,
        evaluation,
        policy,
    };
    let approval = reg.admit(&signed("approver", 1, claim), H, None).unwrap();
    assert_eq!(run(&mut reg, &approval, H), Err(ChainError::Attest("link")));
}

#[test]
fn separation_one_account_cannot_evaluate_and_approve() {
    let Flow {
        mut reg, approval, ..
    } = flow_with("both", "both", true);
    assert!(reg.status(&approval, H).unwrap().authority_confirmed);
    assert_eq!(
        run(&mut reg, &approval, H),
        Err(ChainError::Attest("separation"))
    );
}

#[test]
fn traceability_a_false_signed_statement_gets_only_the_proven_states() {
    let mut reg = registry();
    // Nobody ran anything. The signer has a key and no evaluator role.
    let id = reg
        .admit(&signed("outsider", 1, evaluation(ARTIFACT, true)), H, None)
        .unwrap();
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
    let att = signed(
        "requester",
        1,
        Claim::Request {
            task: [1; 32],
            budget: 1,
        },
    );
    assert_eq!(reg.admit(&att, 51, None), Err(ChainError::Attest("window")));
    reg.admit(&att, H, None).unwrap();
    assert_eq!(reg.admit(&att, H, None), Err(ChainError::Attest("replay")));
    let same_nonce = signed(
        "requester",
        1,
        Claim::Request {
            task: [2; 32],
            budget: 1,
        },
    );
    assert_eq!(
        reg.admit(&same_nonce, H, None),
        Err(ChainError::Attest("replay"))
    );

    let mut stranger = signed(
        "requester",
        2,
        Claim::Request {
            task: [1; 32],
            budget: 1,
        },
    );
    stranger.signer = "nobody".to_string();
    assert_eq!(
        reg.admit(&stranger, H, None),
        Err(ChainError::UnverifiedSignature)
    );

    for nonce in 2..=ATTEST_SIGNER_QUOTA as u8 {
        reg.admit(
            &signed(
                "requester",
                nonce,
                Claim::Request {
                    task: [1; 32],
                    budget: 1,
                },
            ),
            H,
            None,
        )
        .unwrap();
    }
    let over = signed(
        "requester",
        200,
        Claim::Request {
            task: [1; 32],
            budget: 1,
        },
    );
    assert_eq!(reg.admit(&over, H, None), Err(ChainError::Attest("quota")));
    reg.admit(
        &signed(
            "author",
            1,
            Claim::Artifact {
                request: [0; 32],
                artifact: ARTIFACT,
            },
        ),
        H,
        None,
    )
    .unwrap();
}
