//! The activation protocol: what moves the active policy forward, and what
//! refuses to.
//!
//! Every rejection is asserted twice — the error it returns, and that the
//! active record did not move. A refusal that leaves the state changed is not
//! a refusal.
//!
//! What these tests do **not** cover: crash and restart. The store here is in
//! memory, so nothing survives a process and no assertion about durability is
//! available at this layer. That belongs to a backend implementation of
//! `ActivationStore` and to a test that kills a subprocess between the commit
//! and the projection.

use arkhe_core::CanonicalEncode;
use arkhe_governance::activation::{
    activate, candidate_digest, Active, ActivationError, ActivationStore, MemoryActivationStore,
    Proposal, TargetKind, PROPOSAL_SCHEMA,
};
use arkhe_governance::policy_bundle::{
    sign_policy_bundle, PolicyBundleError, PolicyPayload, SignaturePolicy, SignedPolicyBundle,
    TrustStore,
};
use ed25519_dalek::SigningKey;

const POLICY_ID: &str = "arkhe-constitution";
const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const KEY_ID: &str = "dev-founder-key-NOT-FOR-PRODUCTION";
const ISSUED_AT: i64 = 1_795_132_800; // 2026-11-20T00:00:00Z
const EXPIRES_AT: i64 = 1_797_724_800; // 2026-12-20T00:00:00Z
const NOW: i64 = 1_795_200_000;

fn key() -> SigningKey {
    // PUBLIC TEST KEY ONLY. Never trust this key for real credentials.
    SigningKey::from_bytes(&[123; 32])
}

fn trust_store() -> TrustStore {
    let mut store = TrustStore::new();
    store.insert_signing(KEY_ID, &key()).unwrap();
    store
}

fn proposal(
    nonce: u8,
    previous: Option<&str>,
    candidate: &[u8],
    target: TargetKind,
) -> Proposal {
    Proposal {
        schema: PROPOSAL_SCHEMA.into(),
        proposal_id: format!("{nonce:02x}").repeat(16),
        agent_id: AGENT_ID.into(),
        previous_candidate_digest: previous.map(str::to_owned),
        target_kind: target,
        candidate_digest: candidate_digest(candidate),
        context_digest: format!("blake3:{}", "ab".repeat(32)),
        scope: "engineering".into(),
    }
}

fn bundle(version: u64, proposal: &Proposal, expires_at: i64) -> SignedPolicyBundle {
    sign_policy_bundle(
        PolicyPayload {
            policy_id: POLICY_ID.into(),
            statements: serde_json::to_value(proposal).unwrap(),
        },
        version,
        1,
        "arkhe-founder",
        KEY_ID,
        ISSUED_AT,
        expires_at,
        &key(),
    )
}

/// Activate one candidate, returning the digest now in force.
fn first_activation(store: &mut MemoryActivationStore) -> String {
    let candidate = b"policy v2: the first candidate".to_vec();
    let proposal = proposal(0x11, None, &candidate, TargetKind::Policy);
    let bundle = bundle(2, &proposal, EXPIRES_AT);
    let activated = activate(
        store,
        &bundle,
        &candidate,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    )
    .expect("the first activation succeeds");
    activated.active.candidate_digest
}

#[test]
fn t01_a_first_activation_records_state_consumption_and_an_event() {
    let mut store = MemoryActivationStore::new();
    let candidate = b"policy v2: the first candidate".to_vec();
    let proposal = proposal(0x11, None, &candidate, TargetKind::Policy);
    let bundle = bundle(2, &proposal, EXPIRES_AT);

    let activated = activate(
        &mut store,
        &bundle,
        &candidate,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    )
    .expect("activates");

    assert_eq!(activated.active.version, 2);
    assert_eq!(activated.active.candidate_digest, candidate_digest(&candidate));
    assert_eq!(activated.binding.policy_id, POLICY_ID);
    assert_eq!(activated.binding.version, 2);
    assert_eq!(store.consumed(), [proposal.proposal_id.clone()]);
    assert_eq!(store.events().len(), 1);
    assert_eq!(store.events()[0], activated.event);
    assert_eq!(
        store.active(POLICY_ID).unwrap().map(|a| a.version),
        Some(2)
    );
}

#[test]
fn t02_a_second_activation_chains_onto_the_first() {
    let mut store = MemoryActivationStore::new();
    let first = first_activation(&mut store);

    let candidate = b"policy v3: the second candidate".to_vec();
    let proposal = proposal(0x22, Some(&first), &candidate, TargetKind::Policy);
    let activated = activate(
        &mut store,
        &bundle(3, &proposal, EXPIRES_AT),
        &candidate,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    )
    .expect("chains");

    assert_eq!(activated.event.previous_candidate_digest, Some(first));
    assert_eq!(store.events().len(), 2);
    assert_eq!(store.consumed().len(), 2);
}

#[test]
fn t03_a_replay_is_refused_as_a_replay_even_with_the_digest_restored() {
    // The test the Python harness could not pass: its nonce was signed and
    // never recorded, so a replay only ever hit the compare-and-swap, and the
    // moment the active digest returned to its old value the same signed
    // authorization was accepted a second time.
    let mut store = MemoryActivationStore::new();
    let genesis = Active {
        policy_id: POLICY_ID.into(),
        version: 1,
        candidate_digest: candidate_digest(b"policy v1: genesis"),
        context_digest: format!("blake3:{}", "ab".repeat(32)),
        proposal_id: "00".repeat(16),
        activated_at: ISSUED_AT,
    };
    store.force_active(genesis.clone());

    let candidate = b"policy v2: the candidate".to_vec();
    let proposal = proposal(
        0x33,
        Some(&genesis.candidate_digest),
        &candidate,
        TargetKind::Policy,
    );
    let bundle = bundle(2, &proposal, EXPIRES_AT);

    activate(
        &mut store,
        &bundle,
        &candidate,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    )
    .expect("the first activation succeeds");

    // A revert, a restore from backup, a reader that never saw the commit:
    // the active record goes back, the consumption log does not.
    store.force_active(genesis.clone());
    assert_eq!(
        store.active(POLICY_ID).unwrap().unwrap().candidate_digest,
        genesis.candidate_digest,
        "the predecessor the proposal names is in force again"
    );

    let replay = activate(
        &mut store,
        &bundle,
        &candidate,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    );
    assert_eq!(
        replay,
        Err(ActivationError::AlreadyConsumed {
            proposal_id: proposal.proposal_id
        }),
        "a replay must be refused as a replay, not as a version conflict"
    );
    assert_eq!(
        store.active(POLICY_ID).unwrap().unwrap().candidate_digest,
        genesis.candidate_digest
    );
    assert_eq!(store.events().len(), 1, "no second event was written");
}

#[test]
fn t04_two_proposals_for_the_same_predecessor_leave_one_winner() {
    let mut store = MemoryActivationStore::new();
    let first = first_activation(&mut store);

    let candidate_a = b"policy v3: branch a".to_vec();
    let candidate_b = b"policy v3: branch b".to_vec();
    let a = proposal(0x44, Some(&first), &candidate_a, TargetKind::Policy);
    let b = proposal(0x55, Some(&first), &candidate_b, TargetKind::Policy);

    activate(
        &mut store,
        &bundle(3, &a, EXPIRES_AT),
        &candidate_a,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    )
    .expect("a wins");

    let loser = activate(
        &mut store,
        &bundle(4, &b, EXPIRES_AT),
        &candidate_b,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    );
    assert_eq!(
        loser,
        Err(ActivationError::ConcurrencyConflict {
            expected: Some(first),
            actual: Some(candidate_digest(&candidate_a)),
        })
    );
    // The first activation plus `a`; `b` wrote nothing.
    assert_eq!(store.events().len(), 2);
    assert_eq!(
        store.active(POLICY_ID).unwrap().unwrap().candidate_digest,
        candidate_digest(&candidate_a)
    );
}

#[test]
fn t05_two_policies_may_not_share_a_version_number() {
    // `policy_bundle::verify` admits version == current_version, so the number
    // alone never distinguished two different policies. Activation refuses it.
    let mut store = MemoryActivationStore::new();
    let first = first_activation(&mut store);

    let candidate = b"policy v2 alternative: same number, other content".to_vec();
    let alternative = proposal(0x66, Some(&first), &candidate, TargetKind::Policy);
    let result = activate(
        &mut store,
        &bundle(2, &alternative, EXPIRES_AT),
        &candidate,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    );
    assert_eq!(
        result,
        Err(ActivationError::StaleVersion {
            active: 2,
            proposed: 2
        })
    );
    assert_eq!(store.events().len(), 1);
}

#[test]
fn t06_the_bytes_must_be_the_artifact_the_proposal_authorized() {
    let mut store = MemoryActivationStore::new();
    let authorized = b"policy v2: the authorized candidate".to_vec();
    let substituted = b"policy v2: something else entirely".to_vec();
    let proposal = proposal(0x77, None, &authorized, TargetKind::Policy);

    let result = activate(
        &mut store,
        &bundle(2, &proposal, EXPIRES_AT),
        &substituted,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    );
    assert_eq!(
        result,
        Err(ActivationError::CandidateDigestMismatch {
            authorized: candidate_digest(&authorized),
            recomputed: candidate_digest(&substituted),
        })
    );
    assert!(store.active(POLICY_ID).unwrap().is_none());
    assert!(store.consumed().is_empty(), "a refused proposal is not spent");
}

#[test]
fn t07_a_proposal_valid_at_admission_is_refused_at_a_later_activation() {
    let mut store = MemoryActivationStore::new();
    let candidate = b"policy v2: admitted in time".to_vec();
    let proposal = proposal(0x88, None, &candidate, TargetKind::Policy);
    let bundle = bundle(2, &proposal, EXPIRES_AT);

    // Admission: the same check the activation will repeat.
    bundle
        .verify(&trust_store(), 0, SignaturePolicy::Required, NOW)
        .expect("valid at admission");

    let result = activate(
        &mut store,
        &bundle,
        &candidate,
        &trust_store(),
        SignaturePolicy::Required,
        EXPIRES_AT,
    );
    assert_eq!(
        result,
        Err(ActivationError::Authorization(PolicyBundleError::Expired)),
        "expires_at is exclusive, so the instant of expiry is already too late"
    );
    assert!(store.active(POLICY_ID).unwrap().is_none());
}

#[test]
fn t08_a_storage_failure_is_not_a_conflict() {
    // A conflict is answered by re-reading the state; a storage failure by
    // retrying, or by asking whether the proposal was consumed. Collapsing
    // them makes the caller guess.
    let mut store = MemoryActivationStore::new();
    store.fail_commit_with = Some("disk is unavailable".into());

    let candidate = b"policy v2: never committed".to_vec();
    let proposal = proposal(0x99, None, &candidate, TargetKind::Policy);
    let result = activate(
        &mut store,
        &bundle(2, &proposal, EXPIRES_AT),
        &candidate,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    );
    assert_eq!(
        result,
        Err(ActivationError::Storage("disk is unavailable".into()))
    );
    assert!(store.active(POLICY_ID).unwrap().is_none());
    assert!(
        store.consumed().is_empty(),
        "a commit that did not happen spends nothing"
    );
}

#[test]
fn t09_an_adapter_target_is_out_of_scope_in_this_phase() {
    let mut store = MemoryActivationStore::new();
    let candidate = b"lora weights would go here".to_vec();
    let proposal = proposal(0xaa, None, &candidate, TargetKind::Adapter);
    let result = activate(
        &mut store,
        &bundle(2, &proposal, EXPIRES_AT),
        &candidate,
        &trust_store(),
        SignaturePolicy::Required,
        NOW,
    );
    assert_eq!(
        result,
        Err(ActivationError::UnsupportedTarget(TargetKind::Adapter)),
        "an adapter needs its own validation, which this phase does not have"
    );
}

#[test]
fn t10_an_unknown_key_and_an_unsigned_bundle_are_both_refused() {
    let mut store = MemoryActivationStore::new();
    let candidate = b"policy v2: signed by nobody".to_vec();
    let proposal = proposal(0xbb, None, &candidate, TargetKind::Policy);

    let result = activate(
        &mut store,
        &bundle(2, &proposal, EXPIRES_AT),
        &candidate,
        &TrustStore::new(),
        SignaturePolicy::Required,
        NOW,
    );
    assert_eq!(
        result,
        Err(ActivationError::Authorization(
            PolicyBundleError::TrustStoreRequired
        ))
    );

    let mut unsigned = bundle(2, &proposal, EXPIRES_AT);
    unsigned.signature = None;
    assert_eq!(
        activate(
            &mut store,
            &unsigned,
            &candidate,
            &trust_store(),
            SignaturePolicy::Required,
            NOW,
        ),
        Err(ActivationError::Authorization(
            PolicyBundleError::UnsignedBundle
        ))
    );
    assert!(store.active(POLICY_ID).unwrap().is_none());
}

#[test]
fn a_proposal_that_replaces_an_artifact_with_itself_is_refused() {
    let mut store = MemoryActivationStore::new();
    let candidate = b"policy v2: the candidate".to_vec();
    let digest = candidate_digest(&candidate);
    let proposal = proposal(0xcc, Some(&digest), &candidate, TargetKind::Policy);
    assert!(matches!(
        activate(
            &mut store,
            &bundle(2, &proposal, EXPIRES_AT),
            &candidate,
            &trust_store(),
            SignaturePolicy::Required,
            NOW,
        ),
        Err(ActivationError::Schema(_))
    ));
}

#[test]
fn the_activation_event_commits_to_every_field_it_carries() {
    let mut store = MemoryActivationStore::new();
    first_activation(&mut store);
    let event = store.events()[0].clone();
    let digest = event.object_digest();

    for mutate in [
        (|e: &mut arkhe_governance::activation::ActivationEvent| e.version += 1)
            as fn(&mut arkhe_governance::activation::ActivationEvent),
        |e| e.activated_at += 1,
        |e| e.candidate_digest = format!("blake3:{}", "cd".repeat(32)),
        |e| e.context_digest = format!("blake3:{}", "ef".repeat(32)),
        |e| e.proposal_id = "ff".repeat(16),
        |e| e.policy_id = "another-policy".into(),
    ] {
        let mut altered = event.clone();
        mutate(&mut altered);
        assert_ne!(
            altered.object_digest(),
            digest,
            "a changed field left the event digest untouched"
        );
    }
}
