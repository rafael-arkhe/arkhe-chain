use arkhe_core::Digest32;
use arkhe_work::{
    continuity::{unique_authorized_quorum, EmergencyProcedure},
    delegation::{Delegation, DelegationScope},
    employee::EmployeeIdentity,
    private_data::PrivateData,
};

fn valid_procedure() -> EmergencyProcedure {
    EmergencyProcedure {
        procedure_id: Digest32([1; 32]),
        transition: "halt-payouts".into(),
        policy_digest: Digest32([2; 32]),
        required_quorum: 2,
        authorized_operators: vec!["op-a".into(), "op-b".into(), "op-c".into()],
        not_before: 100,
        not_after: 200,
        replay_nonce: Digest32([3; 32]),
    }
}

#[test]
fn emergency_quorum_rejects_duplicates_zero_quorum_unauthorized_and_expired() {
    let proc_spec = valid_procedure();
    assert!(proc_spec
        .validate(&["op-a".into(), "op-b".into()], 150)
        .is_ok());

    // Duplicate signer must not satisfy 2-of-3 quorum.
    assert!(!unique_authorized_quorum(
        &proc_spec,
        &["op-a".into(), "op-a".into()]
    ));
    assert!(proc_spec
        .validate(&["op-a".into(), "op-a".into()], 150)
        .is_err());

    // Unauthorized signer must fail even when quorum count is exceeded.
    assert!(!unique_authorized_quorum(
        &proc_spec,
        &["op-a".into(), "op-b".into(), "intruder".into()]
    ));

    // Zero quorum is never valid.
    let mut zero_q = proc_spec.clone();
    zero_q.required_quorum = 0;
    assert!(!unique_authorized_quorum(&zero_q, &["op-a".into()]));

    // Boundary [not_before, not_after): 100 passes, 99 and 200 fail.
    assert!(proc_spec
        .validate(&["op-a".into(), "op-c".into()], 100)
        .is_ok());
    assert!(proc_spec
        .validate(&["op-a".into(), "op-c".into()], 99)
        .is_err());
    assert!(proc_spec
        .validate(&["op-a".into(), "op-c".into()], 200)
        .is_err());

    // Zero replay_nonce fails closed.
    let mut zero_nonce = proc_spec;
    zero_nonce.replay_nonce = Digest32::ZERO;
    assert!(zero_nonce
        .validate(&["op-a".into(), "op-b".into()], 150)
        .is_err());
}

#[test]
fn delegation_enforces_scope_window_signature_length_and_non_self() {
    let delegation = Delegation {
        delegator: "alice".into(),
        delegatee: "bob".into(),
        scope: DelegationScope::TransitionSet(vec!["triage".into(), "review".into()]),
        not_before: 1_000,
        not_after: 2_000,
        signature: vec![7u8; 64],
    };
    assert!(delegation.matches_request("bob", "review", 1_500));
    assert!(!delegation.matches_request("bob", "publish", 1_500));
    assert!(!delegation.matches_request("alice", "review", 1_500));
    assert!(!delegation.matches_request("bob", "review", 2_000));

    let mut self_del = delegation.clone();
    self_del.delegatee = "alice".into();
    assert!(!self_del.matches_request("alice", "review", 1_500));

    let mut short_sig = delegation;
    short_sig.signature = vec![7u8; 32];
    assert!(!short_sig.matches_request("bob", "review", 1_500));
}

#[test]
fn employee_identity_and_private_data_fail_closed() {
    let active = EmployeeIdentity {
        did: "did:arkhe:emp-1".into(),
        work_public_key: vec![5u8; 32],
        privacy_key_ref: "kms://key-1".into(),
        active: true,
    };
    assert!(active.is_eligible_signer());

    let mut inactive = active.clone();
    inactive.active = false;
    assert!(!inactive.is_eligible_signer());

    let mut zero_pk = active;
    zero_pk.work_public_key = vec![0u8; 32];
    assert!(!zero_pk.is_eligible_signer());

    let secret = PrivateData {
        owner: "did:arkhe:emp-1".into(),
        ciphertext: vec![1, 2, 3, 4],
        key_ref: "kms://key-1".into(),
        plaintext_digest: Digest32([9; 32]),
        expires_at: 500,
    };
    assert!(secret.is_accessible_by("did:arkhe:emp-1", 499));
    assert!(!secret.is_accessible_by("did:arkhe:emp-2", 499));
    assert!(!secret.is_accessible_by("did:arkhe:emp-1", 500));
}
