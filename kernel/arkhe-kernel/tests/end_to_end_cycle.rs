#![cfg(feature = "sqlite-activation")]
//! End-to-end governed execution cycle tests (criteria I1–I7).
//!
//! Exercises the normal kernel entry point:
//!   `SignedPolicyBundle` -> `SqliteActivationStore::activate_bundle`
//!   -> `execute_governed` (`ContainmentGate` over loaded active policy)
//!   -> observable destination effect
//!   -> signed `ExecutionReceipt` + `rbb::mmr` inclusion
//!   -> independent offline verification (`verify_offline_bundle`).

use arkhe_core::work::{RequestIdentity, WorkIntent, WorkIntentType};
use arkhe_core::Digest32;
use arkhe_governance::activation::{
    candidate_digest, ActivationError, Proposal, TargetKind, PROPOSAL_SCHEMA,
};
use arkhe_governance::policy_bundle::{
    sign_policy_bundle, PolicyBundleError, PolicyPayload, SignaturePolicy, SignedPolicyBundle,
    TrustStore,
};
use arkhe_kernel::activation_sqlite::SqliteActivationStore;
use arkhe_kernel::governed_execution::{
    execute_governed, parse_blake3_digest, verify_offline_bundle, ActivePolicyDocument,
    MmrLeafKind, MmrLog, OfflineVerifyError, ReceiptOutcome, ACTIVE_POLICY_SCHEMA,
};
use arkhe_verify_core::rbb::mmr;
use ed25519_dalek::SigningKey;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

const POLICY_ID: &str = "arkhe-e2e-policy";
const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const POLICY_KEY_ID: &str = "dev-founder-policy-key";
const RECEIPT_KEY_ID: &str = "dev-kernel-receipt-key";
const CHECKPOINT_KEY_ID: &str = "dev-mmr-checkpoint-key";
const ISSUED_AT: i64 = 1_795_132_800;
const EXPIRES_AT: i64 = 1_797_724_800;
const NOW: i64 = 1_795_260_000;
const BUSY_TIMEOUT_MS: u64 = 5_000;

struct TestTempDir {
    path: PathBuf,
}

impl TestTempDir {
    fn new(prefix: &str) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("arkhe-e2e-{prefix}-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        Self { path: dir }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TestTempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn policy_signer() -> SigningKey {
    SigningKey::from_bytes(&[11; 32])
}

fn receipt_signer() -> SigningKey {
    SigningKey::from_bytes(&[22; 32])
}

fn checkpoint_signer() -> SigningKey {
    SigningKey::from_bytes(&[33; 32])
}

fn trust_store(key_id: &str, signer: &SigningKey) -> TrustStore {
    let mut store = TrustStore::new();
    store.insert_signing(key_id, signer).unwrap();
    store
}

fn build_policy_bundle(
    version: u64,
    nonce: u8,
    previous: Option<&str>,
    allowed_intents: Vec<WorkIntentType>,
    expires_at: i64,
) -> (SignedPolicyBundle, Vec<u8>) {
    let doc = ActivePolicyDocument {
        schema: ACTIVE_POLICY_SCHEMA.into(),
        allowed_intents,
        review_required_intents: vec![],
    };
    let candidate_bytes = doc.to_bytes().unwrap();
    let proposal = Proposal {
        schema: PROPOSAL_SCHEMA.into(),
        proposal_id: format!("{nonce:02x}").repeat(16),
        agent_id: AGENT_ID.into(),
        previous_candidate_digest: previous.map(str::to_owned),
        target_kind: TargetKind::Policy,
        candidate_digest: candidate_digest(&candidate_bytes),
        context_digest: format!("blake3:{}", "ab".repeat(32)),
        scope: "engineering".into(),
    };
    let bundle = sign_policy_bundle(
        PolicyPayload {
            policy_id: POLICY_ID.into(),
            statements: serde_json::to_value(&proposal).unwrap(),
        },
        version,
        1,
        "arkhe-founder",
        POLICY_KEY_ID,
        ISSUED_AT,
        expires_at,
        &policy_signer(),
    );
    (bundle, candidate_bytes)
}

fn make_intent(intent_type: WorkIntentType, req_key: &[u8], payload: &[u8]) -> WorkIntent {
    WorkIntent {
        requested_by: "agent-alpha".into(),
        intent_type,
        target: Digest32::blake3(b"TEST:TARGET\0", b"destination-table"),
        parameters_digest: Digest32::blake3(b"TEST:PARAMS\0", payload),
        context: vec![],
        context_refs: vec![],
        request_identity: RequestIdentity::new(req_key),
        claimed_created_at: NOW,
    }
}

fn init_destination_db(dest_db: &Path) {
    let conn = Connection::open(dest_db).unwrap();
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         CREATE TABLE IF NOT EXISTS external_effects (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             intent_digest TEXT NOT NULL,
             output_payload BLOB NOT NULL
         );",
    )
    .unwrap();
}

fn write_destination_effect(
    dest_db: &Path,
    intent: &WorkIntent,
    input: &[u8],
) -> Result<Vec<u8>, String> {
    let output = format!("DRAFTED:{}", String::from_utf8_lossy(input)).into_bytes();
    let conn = Connection::open(dest_db).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO external_effects (intent_digest, output_payload) VALUES (?1, ?2)",
        params![intent.digest().to_hex(), &output],
    )
    .map_err(|e| e.to_string())?;
    Ok(output)
}

fn count_destination_effects(dest_db: &Path) -> i64 {
    let conn = Connection::open(dest_db).unwrap();
    conn.query_row("SELECT COUNT(*) FROM external_effects", [], |r| r.get(0))
        .unwrap()
}

#[test]
fn i1_i7_01_valid_policy_executes_emits_signed_receipt_and_verifies_offline_in_mmr() {
    let dir = TestTempDir::new("pos");
    let store_path = dir.path().join("activation.sqlite");
    let dest_path = dir.path().join("destination.sqlite");
    init_destination_db(&dest_path);

    let policy_trust = trust_store(POLICY_KEY_ID, &policy_signer());
    let receipt_trust = trust_store(RECEIPT_KEY_ID, &receipt_signer());
    let checkpoint_trust = trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer());

    let mut store = SqliteActivationStore::open(&store_path, BUSY_TIMEOUT_MS).unwrap();
    let mut mmr_log = MmrLog::new();

    // 1. Activate a valid SignedPolicyBundle allowing only DraftDocument.
    let (bundle_v1, cand_v1) = build_policy_bundle(
        1,
        0x01,
        None,
        vec![WorkIntentType::DraftDocument],
        EXPIRES_AT,
    );
    let activated = store
        .activate_bundle(
            &bundle_v1,
            &cand_v1,
            &policy_trust,
            SignaturePolicy::Required,
            NOW,
        )
        .expect("v1 activation commits");

    // 2. Submit an allowed DraftDocument intent through the normal kernel entry point.
    let input = b"quarterly-evidence-summary";
    let intent = make_intent(WorkIntentType::DraftDocument, b"req-1", input);
    let outcome = execute_governed(
        &mut store,
        &mut mmr_log,
        POLICY_ID,
        &intent,
        input,
        &policy_trust,
        RECEIPT_KEY_ID,
        &receipt_signer(),
        NOW + 10,
        |i, data| write_destination_effect(&dest_path, i, data),
    )
    .expect("governed execution succeeds");

    // 3. Assert observable effect, outbox projection, receipt bindings, and MMR state.
    assert_eq!(count_destination_effects(&dest_path), 1);
    assert_eq!(
        outcome.output.as_deref(),
        Some(b"DRAFTED:quarterly-evidence-summary".as_slice())
    );
    assert!(matches!(
        outcome.receipt.outcome,
        ReceiptOutcome::Executed { .. }
    ));
    assert_eq!(outcome.receipt.policy_id, POLICY_ID);
    assert_eq!(outcome.receipt.policy_version, Some(1));
    assert_eq!(
        outcome.receipt.active_candidate_digest.as_deref(),
        Some(activated.active.candidate_digest.as_str())
    );

    let snap = store.snapshot(POLICY_ID).unwrap();
    assert_eq!(snap.outbox_events.len(), 1);
    assert!(snap.outbox_events[0].projected);
    assert_eq!(mmr_log.count_kind(MmrLeafKind::ActivationEvent), 1);
    assert_eq!(mmr_log.count_kind(MmrLeafKind::ExecutionReceiptExecuted), 1);
    assert_eq!(mmr_log.entries().len(), 2);

    // 4. Produce a signed MMR checkpoint and verify BOTH activation & receipt completely offline.
    let checkpoint = mmr_log
        .sign_checkpoint(NOW + 11, CHECKPOINT_KEY_ID, &checkpoint_signer())
        .unwrap();
    let act_leaf_idx = outcome
        .activation_leaf_index
        .expect("activation leaf present");
    let act_leaf_bytes = parse_blake3_digest(&snap.outbox_events[0].event_digest).unwrap();
    let act_proof = mmr_log.prove(act_leaf_idx).unwrap();
    let receipt_proof = mmr_log.prove(outcome.receipt_leaf_index).unwrap();

    verify_offline_bundle(
        &outcome.receipt,
        &receipt_proof,
        Some((act_leaf_bytes, &act_proof)),
        &checkpoint,
        &receipt_trust,
        &checkpoint_trust,
    )
    .expect("offline verifier confirms checkpoint, receipt signature, and MMR inclusion");

    // 5. Disallowed intent (Simulate) under the same active v1 policy is denied by ContainmentGate
    //    with zero additional destination effects, while recording an auditable rejection leaf.
    let disallowed = make_intent(WorkIntentType::Simulate, b"req-2", b"sim-input");
    let denied = execute_governed(
        &mut store,
        &mut mmr_log,
        POLICY_ID,
        &disallowed,
        b"sim-input",
        &policy_trust,
        RECEIPT_KEY_ID,
        &receipt_signer(),
        NOW + 20,
        |i, data| write_destination_effect(&dest_path, i, data),
    )
    .unwrap();
    assert!(matches!(
        denied.receipt.outcome,
        ReceiptOutcome::Rejected { .. }
    ));
    assert!(denied.output.is_none());
    assert_eq!(count_destination_effects(&dest_path), 1);
    assert_eq!(mmr_log.count_kind(MmrLeafKind::ExecutionReceiptExecuted), 1);
    assert_eq!(mmr_log.count_kind(MmrLeafKind::ExecutionReceiptRejected), 1);
}

#[test]
fn i1_i7_02_invalid_signature_leaves_active_policy_and_destination_intact() {
    let dir = TestTempDir::new("bad-sig");
    let store_path = dir.path().join("activation.sqlite");
    let dest_path = dir.path().join("destination.sqlite");
    init_destination_db(&dest_path);

    let policy_trust = trust_store(POLICY_KEY_ID, &policy_signer());
    let receipt_trust = trust_store(RECEIPT_KEY_ID, &receipt_signer());
    let checkpoint_trust = trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer());

    let mut store = SqliteActivationStore::open(&store_path, BUSY_TIMEOUT_MS).unwrap();
    let mut mmr_log = MmrLog::new();

    // 1. Seed valid v1 allowing only DraftDocument.
    let (bundle_v1, cand_v1) = build_policy_bundle(
        1,
        0x10,
        None,
        vec![WorkIntentType::DraftDocument],
        EXPIRES_AT,
    );
    let v1 = store
        .activate_bundle(
            &bundle_v1,
            &cand_v1,
            &policy_trust,
            SignaturePolicy::Required,
            NOW,
        )
        .unwrap();

    // 2. Attempt v2 (which would permit Simulate) with a corrupted signature.
    let (mut bad_sig_v2, cand_v2) = build_policy_bundle(
        2,
        0x20,
        Some(&v1.active.candidate_digest),
        vec![WorkIntentType::DraftDocument, WorkIntentType::Simulate],
        EXPIRES_AT,
    );
    let mut sig = bad_sig_v2.signature.expect("signed");
    sig[0] ^= 0xFF;
    bad_sig_v2.signature = Some(sig);

    let err_sig = store.activate_bundle(
        &bad_sig_v2,
        &cand_v2,
        &policy_trust,
        SignaturePolicy::Required,
        NOW + 5,
    );
    assert_eq!(
        err_sig,
        Err(ActivationError::Authorization(
            PolicyBundleError::InvalidSignature
        ))
    );

    // 3. Also attempt v2 with an unknown key_id.
    let (mut unknown_key_v2, _) = build_policy_bundle(
        2,
        0x21,
        Some(&v1.active.candidate_digest),
        vec![WorkIntentType::DraftDocument, WorkIntentType::Simulate],
        EXPIRES_AT,
    );
    unknown_key_v2.key_id = "untrusted-key".into();
    let err_key = store.activate_bundle(
        &unknown_key_v2,
        &cand_v2,
        &policy_trust,
        SignaturePolicy::Required,
        NOW + 6,
    );
    assert_eq!(
        err_key,
        Err(ActivationError::Authorization(
            PolicyBundleError::UnknownKey
        ))
    );

    // 4. Active policy in SQLite remains v1 intact; invalid v2 never entered store or outbox.
    let snap = store.snapshot(POLICY_ID).unwrap();
    let active = snap.active.expect("v1 still active");
    assert_eq!(active.version, 1);
    assert_eq!(active.candidate_digest, v1.active.candidate_digest);
    assert_eq!(snap.consumed_count, 1);
    assert_eq!(snap.outbox_events.len(), 1);

    // 5. Submitting Simulate (permitted only by invalid v2) is rejected before effect.
    let sim_intent = make_intent(WorkIntentType::Simulate, b"req-sim-1", b"sim-payload");
    let outcome = execute_governed(
        &mut store,
        &mut mmr_log,
        POLICY_ID,
        &sim_intent,
        b"sim-payload",
        &policy_trust,
        RECEIPT_KEY_ID,
        &receipt_signer(),
        NOW + 10,
        |i, data| write_destination_effect(&dest_path, i, data),
    )
    .unwrap();

    assert!(matches!(
        outcome.receipt.outcome,
        ReceiptOutcome::Rejected { .. }
    ));
    assert_eq!(outcome.receipt.policy_version, Some(1));
    assert!(outcome.output.is_none());
    assert_eq!(count_destination_effects(&dest_path), 0);
    assert_eq!(mmr_log.count_kind(MmrLeafKind::ExecutionReceiptExecuted), 0);
    assert_eq!(mmr_log.count_kind(MmrLeafKind::ExecutionReceiptRejected), 1);

    // Rejection receipt itself verifies offline against the MMR checkpoint.
    let cp = mmr_log
        .sign_checkpoint(NOW + 11, CHECKPOINT_KEY_ID, &checkpoint_signer())
        .unwrap();
    let proof = mmr_log.prove(outcome.receipt_leaf_index).unwrap();
    verify_offline_bundle(
        &outcome.receipt,
        &proof,
        None,
        &cp,
        &receipt_trust,
        &checkpoint_trust,
    )
    .unwrap();
}

#[test]
fn i1_i7_03_expired_active_policy_blocks_action_and_records_refusal() {
    let dir = TestTempDir::new("expired");
    let store_path = dir.path().join("activation.sqlite");
    let dest_path = dir.path().join("destination.sqlite");
    init_destination_db(&dest_path);

    let policy_trust = trust_store(POLICY_KEY_ID, &policy_signer());
    let receipt_trust = trust_store(RECEIPT_KEY_ID, &receipt_signer());
    let checkpoint_trust = trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer());

    let mut store = SqliteActivationStore::open(&store_path, BUSY_TIMEOUT_MS).unwrap();
    let mut mmr_log = MmrLog::new();

    // 1. Activate policy while valid (`NOW < EXPIRES_AT`).
    let (bundle_v1, cand_v1) = build_policy_bundle(
        1,
        0x30,
        None,
        vec![WorkIntentType::DraftDocument],
        EXPIRES_AT,
    );
    store
        .activate_bundle(
            &bundle_v1,
            &cand_v1,
            &policy_trust,
            SignaturePolicy::Required,
            NOW,
        )
        .expect("activation succeeds while within validity window");

    // 2. Advance the test clock to the exclusive expiry boundary (`now == EXPIRES_AT`)
    //    and submit an otherwise-allowed DraftDocument action.
    let intent = make_intent(WorkIntentType::DraftDocument, b"req-exp-1", b"late-doc");
    let outcome = execute_governed(
        &mut store,
        &mut mmr_log,
        POLICY_ID,
        &intent,
        b"late-doc",
        &policy_trust,
        RECEIPT_KEY_ID,
        &receipt_signer(),
        EXPIRES_AT,
        |i, data| write_destination_effect(&dest_path, i, data),
    )
    .unwrap();

    // 3. Gate refuses before effect; destination stays intact; refusal is recorded in MMR.
    match &outcome.receipt.outcome {
        ReceiptOutcome::Rejected { reason } => {
            assert!(
                reason.contains("Expired"),
                "expected Expired reason, got: {reason}"
            );
        }
        ReceiptOutcome::Executed { .. }
        | ReceiptOutcome::ReviewRequired { .. }
        | ReceiptOutcome::ContestedBlocked { .. } => {
            panic!("expired policy must never execute or route to review")
        }
    }
    assert!(outcome.output.is_none());
    assert_eq!(
        count_destination_effects(&dest_path),
        0,
        "expired policy must leave destination intact"
    );
    assert_eq!(mmr_log.count_kind(MmrLeafKind::ActivationEvent), 1);
    assert_eq!(mmr_log.count_kind(MmrLeafKind::ExecutionReceiptExecuted), 0);
    assert_eq!(mmr_log.count_kind(MmrLeafKind::ExecutionReceiptRejected), 1);

    // 4. Independent offline verifier confirms the refusal leaf in the MMR checkpoint
    //    (distinguishing a submitted-and-refused action from an unsubmitted action).
    let cp = mmr_log
        .sign_checkpoint(EXPIRES_AT + 1, CHECKPOINT_KEY_ID, &checkpoint_signer())
        .unwrap();
    let proof = mmr_log.prove(outcome.receipt_leaf_index).unwrap();
    verify_offline_bundle(
        &outcome.receipt,
        &proof,
        None,
        &cp,
        &receipt_trust,
        &checkpoint_trust,
    )
    .expect("offline verifier confirms auditable refusal in MMR");
}

#[test]
fn i1_i7_04_tampered_receipt_forged_resigned_receipt_and_storage_tamper_fail() {
    let dir = TestTempDir::new("tamper");
    let store_path = dir.path().join("activation.sqlite");
    let dest_path = dir.path().join("destination.sqlite");
    init_destination_db(&dest_path);

    let policy_trust = trust_store(POLICY_KEY_ID, &policy_signer());
    let receipt_trust = trust_store(RECEIPT_KEY_ID, &receipt_signer());
    let checkpoint_trust = trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer());

    let mut store = SqliteActivationStore::open(&store_path, BUSY_TIMEOUT_MS).unwrap();
    let mut mmr_log = MmrLog::new();

    let (bundle_v1, cand_v1) = build_policy_bundle(
        1,
        0x40,
        None,
        vec![WorkIntentType::DraftDocument],
        EXPIRES_AT,
    );
    store
        .activate_bundle(
            &bundle_v1,
            &cand_v1,
            &policy_trust,
            SignaturePolicy::Required,
            NOW,
        )
        .unwrap();

    let intent = make_intent(WorkIntentType::DraftDocument, b"req-t1", b"original-input");
    let outcome = execute_governed(
        &mut store,
        &mut mmr_log,
        POLICY_ID,
        &intent,
        b"original-input",
        &policy_trust,
        RECEIPT_KEY_ID,
        &receipt_signer(),
        NOW + 10,
        |i, data| write_destination_effect(&dest_path, i, data),
    )
    .unwrap();
    assert_eq!(count_destination_effects(&dest_path), 1);

    let checkpoint = mmr_log
        .sign_checkpoint(NOW + 11, CHECKPOINT_KEY_ID, &checkpoint_signer())
        .unwrap();
    let proof = mmr_log.prove(outcome.receipt_leaf_index).unwrap();
    let root = checkpoint.verify(&checkpoint_trust).unwrap();

    // Tamper A: Flip observed_output_digest on the receipt without re-signing ->
    //           breaks both signature verification and MMR inclusion.
    let mut tampered = outcome.receipt.clone();
    tampered.outcome = ReceiptOutcome::Executed {
        authorization_ref: match &outcome.receipt.outcome {
            ReceiptOutcome::Executed {
                authorization_ref, ..
            } => authorization_ref.clone(),
            _ => unreachable!(),
        },
        observed_output_digest: format!("blake3:{}", "00".repeat(32)),
        approval_id: None,
    };
    assert_ne!(tampered.leaf_hash(), outcome.receipt.leaf_hash());
    assert_eq!(
        verify_offline_bundle(
            &tampered,
            &proof,
            None,
            &checkpoint,
            &receipt_trust,
            &checkpoint_trust
        ),
        Err(OfflineVerifyError::InvalidReceiptSignature)
    );
    assert!(mmr::verify(&tampered.leaf_hash(), &proof, checkpoint.leaf_count, &root).is_err());

    // Tamper B: Forge a validly re-signed receipt claiming a different output ->
    //           signature passes, BUT MMR inclusion against the trusted checkpoint FAILS.
    let mut forged = tampered.clone();
    forged.sign(&receipt_signer());
    forged
        .verify(&receipt_trust)
        .expect("forged signature is valid");
    assert_eq!(
        verify_offline_bundle(
            &forged,
            &proof,
            None,
            &checkpoint,
            &receipt_trust,
            &checkpoint_trust
        ),
        Err(OfflineVerifyError::ReceiptNotInMmr)
    );

    // Tamper C: Alter 1 byte of the checkpoint root -> checkpoint verification fails.
    let mut bad_cp = checkpoint.clone();
    bad_cp.root_hex = "ff".repeat(32);
    assert_eq!(
        verify_offline_bundle(
            &outcome.receipt,
            &proof,
            None,
            &bad_cp,
            &receipt_trust,
            &checkpoint_trust
        ),
        Err(OfflineVerifyError::InvalidCheckpointSignature)
    );

    // Tamper D: Mutate persisted candidate_bytes directly in SQLite after activation ->
    //           normal kernel entry point detects candidate_digest mismatch and refuses before effect.
    {
        let evil_doc = ActivePolicyDocument {
            schema: ACTIVE_POLICY_SCHEMA.into(),
            allowed_intents: vec![WorkIntentType::DraftDocument, WorkIntentType::Simulate],
            review_required_intents: vec![],
        };
        let conn = Connection::open(&store_path).unwrap();
        conn.execute(
            "UPDATE activation_bundles SET candidate_bytes = ?1 WHERE policy_id = ?2",
            params![evil_doc.to_bytes().unwrap(), POLICY_ID],
        )
        .unwrap();
    }
    let post_tamper_intent = make_intent(WorkIntentType::DraftDocument, b"req-t2", b"second-input");
    let refused = execute_governed(
        &mut store,
        &mut mmr_log,
        POLICY_ID,
        &post_tamper_intent,
        b"second-input",
        &policy_trust,
        RECEIPT_KEY_ID,
        &receipt_signer(),
        NOW + 20,
        |i, data| write_destination_effect(&dest_path, i, data),
    )
    .unwrap();
    match &refused.receipt.outcome {
        ReceiptOutcome::Rejected { reason } => {
            assert!(
                reason.contains("digest mismatch"),
                "expected digest mismatch refusal, got: {reason}"
            );
        }
        ReceiptOutcome::Executed { .. }
        | ReceiptOutcome::ReviewRequired { .. }
        | ReceiptOutcome::ContestedBlocked { .. } => {
            panic!("tampered candidate bytes in SQLite must never execute")
        }
    }
    assert_eq!(
        count_destination_effects(&dest_path),
        1,
        "tampered policy bytes must produce zero new effects"
    );
}
