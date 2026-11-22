#![cfg(feature = "sqlite-broker")]
use arkhe_core::{
    evidence::{EvidenceEnvelope, EvidenceReader},
    work::*,
    worker::*,
    Digest32,
};
use arkhe_governance::{EvidenceKindRequirement, PolicyBinding, PolicyResolver, PolicyVerdict};
use arkhe_kernel::{
    broker::{CapabilityBroker, CapabilityExecutor, DispatchJournal, Reservation},
    broker_sqlite::SqliteDispatchJournal,
    ContainmentGate,
};
use arkhe_verify_core::{
    action_proof::{self, ActionProof, Checkpoint, Mandate, Trust},
    mmr::{build_root_and_proof, profile::PROFILE_DIGEST_HEX},
};
use async_trait::async_trait;
use ed25519_dalek::{Signer, SigningKey};
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

struct Allow;
impl PolicyResolver for Allow {
    fn resolve(&self, _: &WorkIntent, _: &PolicyBinding) -> PolicyVerdict {
        PolicyVerdict::Allow
    }
    fn required_worker_evidence(
        &self,
        _: &WorkIntent,
        _: &PolicyBinding,
    ) -> Option<EvidenceKindRequirement> {
        Some(EvidenceKindRequirement {
            allowed_modules: vec!["l2-test".into()],
            allowed_operations: vec![CognitiveOperation::Analyze],
        })
    }
}

struct Store(EvidenceEnvelope);
#[async_trait]
impl EvidenceReader for Store {
    async fn get(&self, hash: Digest32) -> Result<Option<EvidenceEnvelope>, String> {
        Ok((hash == self.0.record_hash).then(|| self.0.clone()))
    }
}

struct CountingExecutor(Arc<AtomicUsize>);
impl CapabilityExecutor for CountingExecutor {
    fn execute(&mut self, _: &WorkIntent) -> Result<Vec<u8>, String> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Ok(b"ok-receipt".to_vec())
    }
}

fn fixture(
    request_tag: &[u8],
) -> (
    WorkIntent,
    WorkerExecutionRecord,
    PolicyBinding,
    Store,
    ActionProof,
    Trust,
) {
    let source = Digest32::blake3(b"L2:SOURCE", request_tag);
    let params = Digest32::blake3(b"L2:PARAMS", request_tag);
    let target = Digest32::blake3(b"L2:TARGET", request_tag);
    let worker = WorkerExecutionRecord {
        classification: None,
        operation: Some(CognitiveOperation::Analyze),
        module_id: "l2-test".into(),
        module_version: "1".into(),
        input_digest: source,
        output_digest: params,
        evidence_refs: vec![source],
        confidence_bps: None,
        uncertainty_note: None,
        execution_id: "l2-exec".into(),
    };
    let hash = worker.digest();
    let intent = WorkIntent {
        requested_by: "agent-a".into(),
        intent_type: WorkIntentType::Implement,
        target,
        parameters_digest: params,
        context: vec![
            ContextEntry {
                kind: ContextKind::SourceReport,
                hash: source,
            },
            ContextEntry {
                kind: ContextKind::AnalysisRecord,
                hash,
            },
        ],
        context_refs: vec![],
        request_identity: RequestIdentity::new(request_tag),
        claimed_created_at: 100,
    };
    let policy_digest = Digest32::blake3(b"L2:POLICY", b"v1");
    let policy = PolicyBinding {
        policy_id: "l2-policy".into(),
        version: 1,
        policy_digest,
    };
    let envelope = EvidenceEnvelope {
        record_hash: hash,
        kind: "WorkerExecutionRecord".into(),
        subject: source,
        payload_digest: hash,
        policy_digest: None,
        causal_parents: vec![source],
    };
    let mandate_key = SigningKey::from_bytes(&[81; 32]);
    let log_key = SigningKey::from_bytes(&[83; 32]);
    let mandate = Mandate {
        profile: action_proof::PROFILE.into(),
        requested_by: intent.requested_by.clone(),
        intent_type: intent.intent_type.clone(),
        operation_id: intent.operation_id(),
        target: intent.target,
        policy_digest,
        allowed_parameters: vec![intent.parameters_digest],
        issued_at: 100,
        expires_at: 1000,
    };
    let payload = action_proof::mandate_bytes(&mandate).unwrap();
    let (root, steps) = build_root_and_proof(std::slice::from_ref(&payload), 0).unwrap();
    let checkpoint = Checkpoint {
        profile_digest: PROFILE_DIGEST_HEX.into(),
        root,
        leaf_count: 1,
        issued_at: 101,
    };
    let proof = ActionProof {
        mandate_signature: mandate_key.sign(&payload).to_bytes().to_vec(),
        mandate,
        checkpoint_signature: log_key
            .sign(&action_proof::checkpoint_bytes(&checkpoint).unwrap())
            .to_bytes()
            .to_vec(),
        checkpoint: checkpoint.clone(),
        leaf_index: 0,
        steps,
    };
    let trust = Trust {
        mandate_key: mandate_key.verifying_key(),
        log_key: log_key.verifying_key(),
        policy_digest,
        checkpoint,
        now: 102,
        max_checkpoint_age: 2000,
    };
    (intent, worker, policy, Store(envelope), proof, trust)
}

#[tokio::test]
async fn v_agi_02_global_kill_switch_blocks_independent_broker_under_one_second() {
    let path = std::env::temp_dir().join(format!(
        "arkhe-l2-kill-switch-{}.sqlite",
        uuid::Uuid::new_v4()
    ));

    // Step 1: Instance A reserves an in-flight operation before kill switch is engaged.
    let mut inflight_journal = SqliteDispatchJournal::open(&path).unwrap();
    let inflight_op = Digest32([11; 32]);
    let inflight_binding = Digest32([12; 32]);
    assert!(matches!(
        inflight_journal
            .reserve("agent-a", inflight_op, inflight_binding)
            .unwrap(),
        Reservation::Acquired
    ));

    // Step 2: Operator engages GlobalKillSwitch via an independent connection.
    let mut operator_journal = SqliteDispatchJournal::open(&path).unwrap();
    let engaged_at = Instant::now();
    let state = operator_journal
        .engage_global_kill_switch("ops-cli", "V-AGI-02 emergency containment", 1_700_000_000)
        .unwrap();
    assert!(state.engaged);
    assert_eq!(state.epoch, 1);

    // Step 3: Independent Broker B (in-memory emergency_stop == false) attempts dispatch.
    let calls = Arc::new(AtomicUsize::new(0));
    let mut broker_b = CapabilityBroker::new(
        ContainmentGate::new(Allow),
        SqliteDispatchJournal::open(&path).unwrap(),
        CountingExecutor(calls.clone()),
    );
    let (intent, worker, policy, store, proof, trust) = fixture(b"req-blocked");
    let err = broker_b
        .execute(&intent, &worker, &policy, &store, &proof, &trust)
        .await
        .unwrap_err();
    let elapsed = engaged_at.elapsed();
    assert!(
        err.starts_with("kill_switch_engaged"),
        "expected kill_switch_engaged error, got: {err}"
    );
    assert!(
        elapsed < Duration::from_secs(1),
        "global kill switch enforcement exceeded 1s: {elapsed:?}"
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);

    // Step 4: Already-admitted in-flight reservation from Instance A completes and records truth.
    inflight_journal
        .complete("agent-a", inflight_op, inflight_binding, b"inflight-done")
        .unwrap();

    // Step 5: Operator disengages; Broker B can now dispatch a new operation.
    let resumed = operator_journal
        .disengage_global_kill_switch("ops-cli", "incident resolved", 1_700_000_010)
        .unwrap();
    assert!(!resumed.engaged);
    assert_eq!(resumed.epoch, 2);

    let receipt = broker_b
        .execute(&intent, &worker, &policy, &store, &proof, &trust)
        .await
        .unwrap();
    assert_eq!(receipt, b"ok-receipt");
    assert_eq!(calls.load(Ordering::SeqCst), 1);

    // Audit log preserves ordered transitions.
    let audit = operator_journal.kill_switch_audit_log().unwrap();
    assert_eq!(audit.len(), 2);
    assert!(audit[0].engaged && audit[0].epoch == 1 && audit[0].operator == "ops-cli");
    assert!(!audit[1].engaged && audit[1].epoch == 2 && audit[1].operator == "ops-cli");

    drop(broker_b);
    drop(operator_journal);
    drop(inflight_journal);
    let _ = std::fs::remove_file(&path);
}

#[tokio::test]
async fn kill_switch_missing_singleton_row_fails_closed() {
    let path = std::env::temp_dir().join(format!(
        "arkhe-l2-missing-row-{}.sqlite",
        uuid::Uuid::new_v4()
    ));
    let journal = SqliteDispatchJournal::open(&path).unwrap();
    drop(journal);

    // Delete singleton row directly to simulate DB tampering/corruption.
    let raw = rusqlite::Connection::open(&path).unwrap();
    raw.execute("DELETE FROM broker_global_kill_switch WHERE id = 1", [])
        .unwrap();
    drop(raw);

    // Reopening a tampered DB MUST NOT silently re-insert engaged=0 (fail-closed across reopens).
    let mut reopened = SqliteDispatchJournal::open(&path).unwrap();

    let state_err = reopened.global_kill_switch_state().unwrap_err();
    assert!(state_err.contains("kill_switch_state_unavailable"));

    let reserve_err = match reopened.reserve("agent-a", Digest32([1; 32]), Digest32([2; 32])) {
        Err(e) => e,
        Ok(_) => panic!("expected fail-closed reservation error when singleton row is missing"),
    };
    assert!(reserve_err.contains("kill_switch_state_unavailable"));

    let calls = Arc::new(AtomicUsize::new(0));
    let mut broker = CapabilityBroker::new(
        ContainmentGate::new(Allow),
        reopened,
        CountingExecutor(calls.clone()),
    );
    let (intent, worker, policy, store, proof, trust) = fixture(b"req-corrupted");
    let broker_err = broker
        .execute(&intent, &worker, &policy, &store, &proof, &trust)
        .await
        .unwrap_err();
    assert!(broker_err.contains("kill_switch_state_unavailable"));
    assert_eq!(calls.load(Ordering::SeqCst), 0);

    drop(broker);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn kill_switch_singleton_schema_and_validation_enforced() {
    let path =
        std::env::temp_dir().join(format!("arkhe-l2-schema-{}.sqlite", uuid::Uuid::new_v4()));
    let mut journal = SqliteDispatchJournal::open(&path).unwrap();

    // Empty operator or reason rejected.
    assert!(journal
        .engage_global_kill_switch("", "reason", 10)
        .unwrap_err()
        .contains("operator_required"));
    assert!(journal
        .engage_global_kill_switch("ops", "   ", 10)
        .unwrap_err()
        .contains("reason_required"));

    // Singleton constraint rejects id != 1.
    let raw = rusqlite::Connection::open(&path).unwrap();
    assert!(raw
        .execute(
            "INSERT INTO broker_global_kill_switch(id, engaged, reason, updated_by, updated_at_ns, epoch) VALUES(2, 0, '', '', 0, 0)",
            [],
        )
        .is_err());

    // transact_authenticated also blocks when engaged.
    journal
        .engage_global_kill_switch("ops", "halt local tx", 20)
        .unwrap();
    let mut effect_ran = false;
    let tx_err = journal
        .transact_authenticated(
            "agent-a",
            Digest32([3; 32]),
            Digest32([4; 32]),
            Digest32([5; 32]),
            |_tx| {
                effect_ran = true;
                Ok(b"should-not-run".to_vec())
            },
        )
        .unwrap_err();
    assert!(tx_err.starts_with("kill_switch_engaged"));
    assert!(!effect_ran);

    drop(raw);
    drop(journal);
    let _ = std::fs::remove_file(&path);
}

#[tokio::test]
async fn conservative_open_halted_starts_stopped_until_os_operator_activates() {
    use arkhe_kernel::broker_sqlite::AuthenticatedOperator;

    let path = std::env::temp_dir().join(format!(
        "arkhe-l2-conservative-halted-{}.sqlite",
        uuid::Uuid::new_v4()
    ));

    // Conservative startup begins halted (engaged = 1) and records initial audit row.
    let journal = SqliteDispatchJournal::open_halted(&path).unwrap();
    let initial = journal.global_kill_switch_state().unwrap();
    assert!(initial.engaged);
    assert_eq!(initial.epoch, 0);
    assert_eq!(initial.reason, "initial_conservative_halt");
    assert_eq!(initial.updated_by, "system:init");
    let audit0 = journal.kill_switch_audit_log().unwrap();
    assert_eq!(audit0.len(), 1);
    assert!(audit0[0].engaged && audit0[0].epoch == 0);

    // Even a valid mandate is refused before authorized activation.
    let calls = Arc::new(AtomicUsize::new(0));
    let mut broker = CapabilityBroker::new(
        ContainmentGate::new(Allow),
        journal,
        CountingExecutor(calls.clone()),
    );
    let (intent, worker, policy, store, proof, trust) = fixture(b"req-before-activation");
    let err = broker
        .execute(&intent, &worker, &policy, &store, &proof, &trust)
        .await
        .unwrap_err();
    assert!(err.starts_with("kill_switch_engaged: initial_conservative_halt"));
    assert_eq!(calls.load(Ordering::SeqCst), 0);

    // Operator authenticated from OS peer boundary activates the system.
    let op = AuthenticatedOperator::from_os_peer(2002, Some(9999));
    let activated = broker
        .disengage_global_kill_switch_as(&op, "authorized L1 startup", 1_700_000_001)
        .unwrap();
    assert!(!activated.engaged);
    assert_eq!(activated.epoch, 1);
    assert_eq!(activated.updated_by, "os-uid:2002:pid:9999");

    // Now the permitted request succeeds.
    let receipt = broker
        .execute(&intent, &worker, &policy, &store, &proof, &trust)
        .await
        .unwrap();
    assert_eq!(receipt, b"ok-receipt");
    assert_eq!(calls.load(Ordering::SeqCst), 1);

    // Reopening an already-activated DB preserves its state (does NOT reset to halted).
    drop(broker);
    let reopened = SqliteDispatchJournal::open_halted(&path).unwrap();
    let state_after_reopen = reopened.global_kill_switch_state().unwrap();
    assert!(!state_after_reopen.engaged);
    assert_eq!(state_after_reopen.epoch, 1);
    drop(reopened);
    let _ = std::fs::remove_file(&path);
}
