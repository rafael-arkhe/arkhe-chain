use std::collections::BTreeMap;

use arkhe_chain::{
    public_key, sign_attestation, AttestPolicy, AttestRegistry, Attestation, ChainError, Claim,
    ExternalAnchoringProof, Grant, OfflineVerificationBundle, Receipt, RegistryCheckpoint, Role,
    ATTEST_SCHEME_ED25519, ATTEST_VERSION,
};
use arkhe_verify_core::rbb::mmr;

const CHAIN: &str = "arkhe-chain";
const AUDIENCE: &str = "shadow-optimizer";
const GENESIS: [u8; 32] = [9; 32];
const ARTIFACT: [u8; 32] = [0xA1; 32];
const ACTION: [u8; 32] = [0xAC; 32];
const H: u64 = 10;

fn secret(name: &str) -> [u8; 32] {
    [match name {
        "root" => 1,
        "requester" => 2,
        "author" => 3,
        "evaluator" => 4,
        "approver" => 5,
        other => panic!("{other}"),
    }; 32]
}

fn policy() -> AttestPolicy {
    let mut keys = BTreeMap::new();
    for name in ["root", "requester", "author", "evaluator", "approver"] {
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
        ],
    }
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

fn flow(reg: &mut AttestRegistry) -> ([u8; 32], Receipt) {
    let request = reg
        .admit(
            &signed("requester", 1, Claim::Request { task: [0x7A; 32], budget: 5 }),
            H,
            None,
        )
        .unwrap();
    reg.admit(
        &signed("author", 1, Claim::Artifact { request, artifact: ARTIFACT }),
        H,
        None,
    )
    .unwrap();
    let evaluation = reg
        .admit(&signed("evaluator", 1, evaluation(ARTIFACT, true)), H, None)
        .unwrap();
    let policy = reg.policy_digest();
    let approval = reg
        .admit(
            &signed(
                "approver",
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
    let (receipt, _) = reg
        .execute(&approval, &ACTION, &ARTIFACT, H, None, |r| Ok(r.leaf))
        .unwrap();
    (approval, receipt)
}

#[test]
fn offline_bundle_verifies_mmr_inclusion_locally() {
    let mut reg = AttestRegistry::new(CHAIN, GENESIS, AUDIENCE, policy()).unwrap();
    let (approval, receipt) = flow(&mut reg);
    let trusted = RegistryCheckpoint {
        root: reg.root().unwrap(),
        leaf_count: reg.count(),
    };

    let bundle = OfflineVerificationBundle::from_registry(
        &reg,
        &approval,
        ExternalAnchoringProof::Absent,
    )
    .unwrap();
    assert_eq!(bundle.receipt.leaf, receipt.leaf);
    bundle.verify_inclusion(&trusted).unwrap();

    let json = serde_json::to_string(&bundle).unwrap();
    let back: OfflineVerificationBundle = serde_json::from_str(&json).unwrap();
    back.verify_inclusion(&trusted).unwrap();
}

#[test]
fn tampered_inclusion_or_checkpoint_is_rejected() {
    let mut reg = AttestRegistry::new(CHAIN, GENESIS, AUDIENCE, policy()).unwrap();
    let (approval, receipt) = flow(&mut reg);
    let trusted = RegistryCheckpoint {
        root: reg.root().unwrap(),
        leaf_count: reg.count(),
    };
    let mut bundle =
        OfflineVerificationBundle::from_registry(&reg, &approval, ExternalAnchoringProof::Absent)
            .unwrap();
    bundle.inclusion.leaf_record[0] ^= 1;
    assert_eq!(
        bundle.verify_inclusion(&trusted),
        Err(ChainError::AuditBundle("receipt"))
    );

    let mut bundle =
        OfflineVerificationBundle::from_registry(&reg, &approval, ExternalAnchoringProof::Absent)
            .unwrap();
    bundle.checkpoint.root[0] ^= 1;
    assert_eq!(
        bundle.verify_inclusion(&trusted),
        Err(ChainError::AuditBundle("checkpoint"))
    );

    let (proof, record, root) = reg.inclusion_proof(receipt.leaf).unwrap();
    mmr::verify(&record, &proof, reg.count(), &root).unwrap();
    let mut bad_record = record;
    bad_record[0] ^= 1;
    assert!(mmr::verify(&bad_record, &proof, reg.count(), &root).is_err());
}

#[test]
fn external_anchoring_fail_closed() {
    let mut reg = AttestRegistry::new(CHAIN, GENESIS, AUDIENCE, policy()).unwrap();
    let (approval, _) = flow(&mut reg);

    let absent =
        OfflineVerificationBundle::from_registry(&reg, &approval, ExternalAnchoringProof::Absent)
            .unwrap();
    assert_eq!(
        absent.verify_external_anchoring(),
        Err(ChainError::ExternalAnchorAbsent)
    );

    let stub = OfflineVerificationBundle::from_registry(
        &reg,
        &approval,
        ExternalAnchoringProof::RekorDryrunStub {
            trust_root_id: "rekor:dryrun:deadbeef".into(),
        },
    )
    .unwrap();
    assert_eq!(
        stub.verify_external_anchoring(),
        Err(ChainError::ExternalAnchorStub)
    );

    let root = reg.root().unwrap();
    let plan = OfflineVerificationBundle::from_registry(
        &reg,
        &approval,
        ExternalAnchoringProof::BtcOpReturnPlan {
            op_return: arkhe_chain::btc_op_return(&root).to_vec(),
            broadcast: false,
        },
    )
    .unwrap();
    assert_eq!(
        plan.verify_external_anchoring(),
        Err(ChainError::ExternalAnchorAbsent)
    );

    let fake_broadcast = OfflineVerificationBundle::from_registry(
        &reg,
        &approval,
        ExternalAnchoringProof::BtcOpReturnPlan {
            op_return: arkhe_chain::btc_op_return(&root).to_vec(),
            broadcast: true,
        },
    )
    .unwrap();
    assert_eq!(
        fake_broadcast.verify_external_anchoring(),
        Err(ChainError::ExternalAnchorStub)
    );
}