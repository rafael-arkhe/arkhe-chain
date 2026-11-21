#![cfg(feature = "sqlite-activation")]
//! C1 — Append-only contestation without mutating the original receipt.
//!
//! Operates directly on real `ExecutionReceipt`s produced by the governed HTTP
//! gateway (`POST /v1/governed/execute`) and submitted to `POST /v1/governed/contest`:
//! - `c1_contestation_does_not_mutate_original_receipt`: proves byte-exact,
//!   digest-exact, and position-exact preservation of the original receipt,
//!   append-only addition of one typed contestation leaf, and independent offline
//!   verification of BOTH records against the same posterior `MmrCheckpoint`.
//! - Three negative controls mutate one binding digest at a time
//!   (`receipt_digest`, `policy_digest`, `activation_event_digest`) and assert
//!   rejection with MMR root and leaf count completely unchanged.

use arkhe_core::work::WorkIntentType;
use arkhe_core::Digest32;
use arkhe_governance::activation::{candidate_digest, Proposal, TargetKind, PROPOSAL_SCHEMA};
use arkhe_governance::policy_bundle::{
    sign_policy_bundle, PolicyPayload, SignedPolicyBundle, TrustStore,
};
use arkhe_kernel::activation_sqlite::SqliteActivationStore;
use arkhe_kernel::governed_execution::{
    verify_offline_bundle, verify_offline_contestation_bundle, ActivePolicyDocument,
    ContestationRecord, ExecutionReceipt, ACTIVE_POLICY_SCHEMA, CONTESTATION_RECORD_SCHEMA,
};
use arkhe_runtime::governed_gateway::{
    router, ActivatePolicyRequest, ContestReceiptRequest, ContestReceiptResponse,
    GovernedExecuteRequest, GovernedExecuteResponse, GovernedGatewayState,
};
use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use ed25519_dalek::SigningKey;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::Arc;
use tower::ServiceExt;

const TOKEN: &str = "c1-contestation-test-token";
const ACTOR: &str = "agent-c1-client";
const POLICY_ID: &str = "arkhe-c1-policy";
const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const POLICY_KEY_ID: &str = "dev-founder-policy-key";
const REVIEWER_KEY_ID: &str = "dev-human-reviewer-key";
const CONTESTER_KEY_ID: &str = "dev-auditor-contester-key";
const RECEIPT_KEY_ID: &str = "dev-kernel-receipt-key";
const CHECKPOINT_KEY_ID: &str = "dev-mmr-checkpoint-key";
const ISSUED_AT: i64 = 1_795_132_800;
const EXPIRES_AT: i64 = 1_797_724_800;
const NOW: i64 = 1_795_280_000;
const BUSY_TIMEOUT_MS: u64 = 5_000;

struct TestTempDir {
    path: PathBuf,
}

impl TestTempDir {
    fn new(prefix: &str) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("arkhe-c1-{prefix}-{}-{n}", std::process::id()));
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

fn reviewer_signer() -> SigningKey {
    SigningKey::from_bytes(&[44; 32])
}

fn contester_signer() -> SigningKey {
    SigningKey::from_bytes(&[55; 32])
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

fn build_policy_bundle(nonce: u8) -> (SignedPolicyBundle, Vec<u8>) {
    let doc = ActivePolicyDocument {
        schema: ACTIVE_POLICY_SCHEMA.into(),
        allowed_intents: vec![WorkIntentType::DraftDocument],
        review_required_intents: vec![],
    };
    let candidate_bytes = doc.to_bytes().unwrap();
    let proposal = Proposal {
        schema: PROPOSAL_SCHEMA.into(),
        proposal_id: format!("{nonce:02x}").repeat(16),
        agent_id: AGENT_ID.into(),
        previous_candidate_digest: None,
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
        1,
        1,
        "arkhe-founder",
        POLICY_KEY_ID,
        ISSUED_AT,
        EXPIRES_AT,
        &policy_signer(),
    );
    (bundle, candidate_bytes)
}

async fn post_json(
    app: &axum::Router,
    uri: &str,
    body: &impl serde::Serialize,
) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {TOKEN}"))
        .body(Body::from(serde_json::to_vec(body).unwrap()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = to_bytes(resp.into_body(), 1_048_576).await.unwrap();
    let val: Value = serde_json::from_slice(&bytes).unwrap();
    (status, val)
}

async fn setup_executed_receipt(
    dir: &Path,
    nonce: u8,
) -> (
    Arc<GovernedGatewayState>,
    axum::Router,
    ExecutionReceipt,
    GovernedExecuteResponse,
) {
    let db_path = dir.join("c1_activation.sqlite");
    let store = SqliteActivationStore::open(&db_path, BUSY_TIMEOUT_MS).unwrap();
    let clock = Arc::new(AtomicI64::new(NOW));

    let state = Arc::new(
        GovernedGatewayState::new(
            store,
            TOKEN,
            ACTOR,
            trust_store(POLICY_KEY_ID, &policy_signer()),
            trust_store(REVIEWER_KEY_ID, &reviewer_signer()),
            RECEIPT_KEY_ID,
            receipt_signer(),
            CHECKPOINT_KEY_ID,
            checkpoint_signer(),
            Arc::new(move || clock.load(Ordering::SeqCst)),
            Arc::new(|_intent, input| {
                Ok(format!("DRAFT:{}", String::from_utf8_lossy(input)).into_bytes())
            }),
        )
        .with_contester_trust(trust_store(CONTESTER_KEY_ID, &contester_signer())),
    );
    let app = router(Arc::clone(&state));

    let (bundle, cand) = build_policy_bundle(nonce);
    let (s_act, body_act) = post_json(
        &app,
        "/v1/policies/activate",
        &ActivatePolicyRequest {
            bundle,
            candidate_bytes_hex: hex::encode(&cand),
        },
    )
    .await;
    assert_eq!(s_act, StatusCode::OK, "activation failed: {body_act}");

    let exec_req = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: Digest32::blake3(b"C1:TARGET\0", b"doc-1").to_hex(),
        request_key: format!("c1-req-{nonce}"),
        claimed_created_at: NOW,
        action_input_hex: hex::encode(b"evidence-document-v1"),
        context_refs_hex: vec![],
        approval: None,
    };
    let (s_exec, body_exec) = post_json(&app, "/v1/governed/execute", &exec_req).await;
    assert_eq!(s_exec, StatusCode::OK, "execution failed: {body_exec}");
    let exec_resp: GovernedExecuteResponse = serde_json::from_value(body_exec).unwrap();
    assert_eq!(exec_resp.decision, "ALLOWED");
    let receipt = exec_resp.receipt.clone();
    (state, app, receipt, exec_resp)
}

fn signed_contestation(
    contestation_id: &str,
    receipt_digest: String,
    policy_digest: String,
    activation_event_digest: String,
) -> ContestationRecord {
    let mut rec = ContestationRecord {
        schema: CONTESTATION_RECORD_SCHEMA.into(),
        contestation_id: contestation_id.into(),
        receipt_digest,
        policy_digest,
        activation_event_digest,
        reason: "material discrepancy observed in audit review".into(),
        contested_at: NOW + 30,
        contester_key_id: CONTESTER_KEY_ID.into(),
        signature_hex: String::new(),
    };
    rec.sign(&contester_signer());
    rec
}

#[tokio::test]
async fn c1_contestation_does_not_mutate_original_receipt() {
    let dir = TestTempDir::new("preserve");
    let (state, app, original_receipt, exec_resp) = setup_executed_receipt(dir.path(), 0x11).await;

    // Capture exact bytes, digest, position, and MMR state BEFORE contestation.
    let original_leaf = original_receipt.leaf_hash();
    let original_digest_before = original_receipt.leaf_digest_str();
    let (original_pos_before, original_bytes_before) = state
        .receipt_snapshot(&original_leaf)
        .expect("original receipt stored in MMR");
    assert_eq!(original_pos_before, exec_resp.receipt_proof.leaf_index);
    assert_eq!(
        original_bytes_before,
        original_receipt.canonical_signed_bytes()
    );
    let (_, count_before) = state.mmr_root_and_count().unwrap();
    assert_eq!(count_before, 2); // leaf 0: activation, leaf 1: executed receipt

    let original_policy_digest = original_receipt
        .active_candidate_digest
        .clone()
        .expect("policy digest bound");
    let original_activation_digest = original_receipt
        .activation_event_digest
        .clone()
        .expect("activation digest bound");

    // Submit a signed ContestationRecord referencing all three original digests.
    let contestation = signed_contestation(
        &"c1".repeat(16),
        original_digest_before.clone(),
        original_policy_digest.clone(),
        original_activation_digest.clone(),
    );
    let contestation_digest = contestation.leaf_digest_str();
    assert_ne!(contestation_digest, original_digest_before);

    let (status, val) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest {
            contestation: contestation.clone(),
        },
    )
    .await;
    assert_eq!(status, StatusCode::OK, "contestation body={val}");
    let contest_resp: ContestReceiptResponse = serde_json::from_value(val).unwrap();
    assert_eq!(contest_resp.decision, "CONTESTED");

    // Verify exact preservation of original receipt bytes, digest, and position (C1.2–C1.4).
    let (original_pos_after, original_bytes_after) = state
        .receipt_snapshot(&original_leaf)
        .expect("original receipt still stored in MMR");
    assert_eq!(original_bytes_after, original_bytes_before);
    assert_eq!(
        hex::decode(&contest_resp.original_receipt_bytes_hex).unwrap(),
        original_bytes_before
    );
    assert_eq!(contest_resp.original_receipt_digest, original_digest_before);
    assert_eq!(original_pos_after, original_pos_before);
    assert_eq!(
        contest_resp.original_receipt_leaf_index,
        original_pos_before
    );

    // Verify append-only growth by exactly one typed contestation leaf (C1.5).
    let (_, count_after) = state.mmr_root_and_count().unwrap();
    assert_eq!(count_after, count_before + 1);
    assert_eq!(contest_resp.contestation_leaf_index, count_before);
    assert_eq!(contest_resp.checkpoint.leaf_count, count_after);
    let counts = state.mmr_counts();
    assert_eq!(counts.activation_events, 1);
    assert_eq!(counts.executed_receipts, 1);
    assert_eq!(counts.contestation_records, 1);

    // Verify triple binding on the admitted contestation record (C1.1).
    assert_eq!(
        contest_resp.contestation.receipt_digest,
        original_digest_before
    );
    assert_eq!(
        contest_resp.contestation.policy_digest,
        original_policy_digest
    );
    assert_eq!(
        contest_resp.contestation.activation_event_digest,
        original_activation_digest
    );

    // Independent offline verification of BOTH the untouched original receipt AND the
    // appended contestation record against the SAME posterior MmrCheckpoint (C1.6).
    let receipt_trust = trust_store(RECEIPT_KEY_ID, &receipt_signer());
    let contester_trust = trust_store(CONTESTER_KEY_ID, &contester_signer());
    let checkpoint_trust = trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer());

    verify_offline_contestation_bundle(
        &original_receipt,
        &contest_resp.original_receipt_proof,
        &contest_resp.contestation,
        &contest_resp.contestation_proof,
        &contest_resp.checkpoint,
        &receipt_trust,
        &contester_trust,
        &checkpoint_trust,
    )
    .expect("offline verification of original receipt + contestation on same checkpoint must pass");

    verify_offline_bundle(
        &original_receipt,
        &contest_resp.original_receipt_proof,
        None,
        &contest_resp.checkpoint,
        &receipt_trust,
        &checkpoint_trust,
    )
    .expect("original receipt alone still verifies offline against posterior checkpoint");
}

#[tokio::test]
async fn c1_contestation_with_wrong_receipt_digest_fails() {
    let dir = TestTempDir::new("wrong-receipt");
    let (state, app, original_receipt, _) = setup_executed_receipt(dir.path(), 0x22).await;
    let (root_before, count_before) = state.mmr_root_and_count().unwrap();

    let bad = signed_contestation(
        &"c2".repeat(16),
        format!("blake3:{}", "00".repeat(32)), // wrong receipt_digest
        original_receipt.active_candidate_digest.clone().unwrap(),
        original_receipt.activation_event_digest.clone().unwrap(),
    );
    let (status, val) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest { contestation: bad },
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body={val}");
    assert_eq!(val["decision"], "REJECTED");
    assert_eq!(val["error"], "receipt_not_found");

    let (root_after, count_after) = state.mmr_root_and_count().unwrap();
    assert_eq!(root_after, root_before);
    assert_eq!(count_after, count_before);
    assert_eq!(state.mmr_counts().contestation_records, 0);
}

#[tokio::test]
async fn c1_contestation_with_wrong_policy_digest_fails() {
    let dir = TestTempDir::new("wrong-policy");
    let (state, app, original_receipt, _) = setup_executed_receipt(dir.path(), 0x33).await;
    let (root_before, count_before) = state.mmr_root_and_count().unwrap();

    let bad = signed_contestation(
        &"c3".repeat(16),
        original_receipt.leaf_digest_str(),
        format!("blake3:{}", "11".repeat(32)), // wrong policy_digest
        original_receipt.activation_event_digest.clone().unwrap(),
    );
    let (status, val) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest { contestation: bad },
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "body={val}");
    assert_eq!(val["decision"], "REJECTED");
    assert_eq!(val["error"], "policy_digest_mismatch");

    let (root_after, count_after) = state.mmr_root_and_count().unwrap();
    assert_eq!(root_after, root_before);
    assert_eq!(count_after, count_before);
    assert_eq!(state.mmr_counts().contestation_records, 0);
}

#[tokio::test]
async fn c1_contestation_with_wrong_activation_event_digest_fails() {
    let dir = TestTempDir::new("wrong-activation");
    let (state, app, original_receipt, _) = setup_executed_receipt(dir.path(), 0x44).await;
    let (root_before, count_before) = state.mmr_root_and_count().unwrap();

    let bad = signed_contestation(
        &"c4".repeat(16),
        original_receipt.leaf_digest_str(),
        original_receipt.active_candidate_digest.clone().unwrap(),
        format!("blake3:{}", "22".repeat(32)), // wrong activation_event_digest
    );
    let (status, val) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest { contestation: bad },
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "body={val}");
    assert_eq!(val["decision"], "REJECTED");
    assert_eq!(val["error"], "activation_event_digest_mismatch");

    let (root_after, count_after) = state.mmr_root_and_count().unwrap();
    assert_eq!(root_after, root_before);
    assert_eq!(count_after, count_before);
    assert_eq!(state.mmr_counts().contestation_records, 0);

    // Bonus control: valid digests with corrupted contester signature must also leave MMR intact.
    let mut bad_sig = signed_contestation(
        &"c5".repeat(16),
        original_receipt.leaf_digest_str(),
        original_receipt.active_candidate_digest.clone().unwrap(),
        original_receipt.activation_event_digest.clone().unwrap(),
    );
    bad_sig.signature_hex = "00".repeat(64);
    let (status_sig, val_sig) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest {
            contestation: bad_sig,
        },
    )
    .await;
    assert_eq!(status_sig, StatusCode::FORBIDDEN, "body={val_sig}");
    assert_eq!(val_sig["decision"], "REJECTED");
    assert_eq!(val_sig["error"], "invalid_contestation_record");

    let (root_final, count_final) = state.mmr_root_and_count().unwrap();
    assert_eq!(root_final, root_before);
    assert_eq!(count_final, count_before);
    assert_eq!(state.mmr_counts().contestation_records, 0);
}
