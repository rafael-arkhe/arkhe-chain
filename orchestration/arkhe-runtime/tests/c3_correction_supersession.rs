#![cfg(feature = "sqlite-activation")]
//! C3 & C4 — Append-only superseding correction (`CorrectionRecord`) with
//! verifiable active contestation basis, preserving prior history bit-for-bit
//! and preserving the active contestation block until explicit resolution (C5).

use arkhe_core::work::{RequestIdentity, WorkIntent, WorkIntentType};
use arkhe_core::Digest32;
use arkhe_governance::activation::{candidate_digest, Proposal, TargetKind, PROPOSAL_SCHEMA};
use arkhe_governance::policy_bundle::{
    sign_policy_bundle, PolicyPayload, SignedPolicyBundle, TrustStore,
};
use arkhe_kernel::activation_sqlite::SqliteActivationStore;
use arkhe_kernel::governed_execution::{
    compute_action_digest, verify_offline_contestation_block_bundle,
    verify_offline_correction_bundle, ActivePolicyDocument, ContestationRecord, CorrectionRecord,
    ExecutionReceipt, ReceiptOutcome, ReviewApproval, ACTIVE_POLICY_SCHEMA,
    CONTESTATION_RECORD_SCHEMA, CORRECTION_RECORD_SCHEMA, REVIEW_APPROVAL_SCHEMA,
};
use arkhe_runtime::governed_gateway::{
    router, ActivatePolicyRequest, ContestReceiptRequest, ContestReceiptResponse,
    CorrectReceiptRequest, CorrectReceiptResponse, GovernedExecuteRequest, GovernedExecuteResponse,
    GovernedGatewayState,
};
use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use ed25519_dalek::SigningKey;
use serde_json::Value;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::Arc;
use tower::ServiceExt;

const TOKEN: &str = "c3-correction-test-token";
const ACTOR: &str = "agent-c3-client";
const POLICY_ID: &str = "arkhe-c3-policy";
const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const POLICY_KEY_ID: &str = "dev-founder-policy-key";
const REVIEWER_KEY_ID: &str = "dev-human-reviewer-key";
const CONTESTER_KEY_ID: &str = "dev-auditor-contester-key";
const CORRECTOR_KEY_ID: &str = "dev-remediator-corrector-key";
const RECEIPT_KEY_ID: &str = "dev-kernel-receipt-key";
const CHECKPOINT_KEY_ID: &str = "dev-mmr-checkpoint-key";
const ISSUED_AT: i64 = 1_795_132_800;
const EXPIRES_AT: i64 = 1_797_724_800;
const NOW: i64 = 1_795_300_000;
const BUSY_TIMEOUT_MS: u64 = 5_000;

struct TestTempDir {
    path: PathBuf,
}

impl TestTempDir {
    fn new(prefix: &str) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("arkhe-c3-{prefix}-{}-{n}", std::process::id()));
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

fn corrector_signer() -> SigningKey {
    SigningKey::from_bytes(&[66; 32])
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

fn target_hex(label: &[u8]) -> String {
    Digest32::blake3(b"C3:TARGET\0", label).to_hex()
}

fn count_external_effects(dest_log: &Path) -> usize {
    match std::fs::read_to_string(dest_log) {
        Ok(content) => content.lines().filter(|l| !l.trim().is_empty()).count(),
        Err(_) => 0,
    }
}

fn build_policy_bundle(
    nonce: u8,
    review_required_intents: Vec<WorkIntentType>,
) -> (SignedPolicyBundle, Vec<u8>) {
    let doc = ActivePolicyDocument {
        schema: ACTIVE_POLICY_SCHEMA.into(),
        allowed_intents: vec![WorkIntentType::DraftDocument],
        review_required_intents,
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

async fn setup_gateway(
    dir: &Path,
    nonce: u8,
    review_required_intents: Vec<WorkIntentType>,
) -> (Arc<GovernedGatewayState>, axum::Router, PathBuf) {
    let db_path = dir.join("c3_activation.sqlite");
    let dest_log = dir.join("c3_external_effects.jsonl");
    let store = SqliteActivationStore::open(&db_path, BUSY_TIMEOUT_MS).unwrap();
    let clock = Arc::new(AtomicI64::new(NOW));
    let dest_for_effect = dest_log.clone();

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
            Arc::new(move |intent, input| {
                let output = format!("EFFECT:{}", String::from_utf8_lossy(input)).into_bytes();
                let mut f = OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&dest_for_effect)
                    .map_err(|e| e.to_string())?;
                writeln!(f, "{} {}", intent.digest().to_hex(), hex::encode(&output))
                    .map_err(|e| e.to_string())?;
                f.sync_all().map_err(|e| e.to_string())?;
                Ok(output)
            }),
        )
        .with_contester_trust(trust_store(CONTESTER_KEY_ID, &contester_signer()))
        .with_corrector_trust(trust_store(CORRECTOR_KEY_ID, &corrector_signer())),
    );
    let app = router(Arc::clone(&state));

    let (bundle, cand) = build_policy_bundle(nonce, review_required_intents);
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
    (state, app, dest_log)
}

fn compute_request_action_digest(req: &GovernedExecuteRequest) -> String {
    let target_bytes: [u8; 32] = hex::decode(&req.target_hex).unwrap().try_into().unwrap();
    let action_input = hex::decode(&req.action_input_hex).unwrap();
    let context_refs: Vec<Digest32> = req
        .context_refs_hex
        .iter()
        .map(|raw| {
            let s = raw.strip_prefix("blake3:").unwrap_or(raw.as_str());
            let bytes: [u8; 32] = hex::decode(s).unwrap().try_into().unwrap();
            Digest32(bytes)
        })
        .collect();
    let intent = WorkIntent {
        requested_by: ACTOR.into(),
        intent_type: req.intent_type.clone(),
        target: Digest32(target_bytes),
        parameters_digest: Digest32::blake3(b"AKG:HTTP:PARAMS:v1\0", &action_input),
        context: vec![],
        context_refs,
        request_identity: RequestIdentity::new(req.request_key.as_bytes()),
        claimed_created_at: req.claimed_created_at,
    };
    let intent_digest = format!("blake3:{}", intent.digest().to_hex());
    let input_digest = format!(
        "blake3:{}",
        Digest32::blake3(b"AKG:ACTION:INPUT:v1\0", &action_input).to_hex()
    );
    compute_action_digest(&intent_digest, &input_digest)
}

fn sign_exact_approval(
    approval_id: &str,
    req: &GovernedExecuteRequest,
    policy_digest: &str,
    activation_event_digest: &str,
) -> ReviewApproval {
    let mut appr = ReviewApproval {
        schema: REVIEW_APPROVAL_SCHEMA.into(),
        approval_id: approval_id.into(),
        action_digest: compute_request_action_digest(req),
        policy_digest: policy_digest.into(),
        activation_event_digest: activation_event_digest.into(),
        issued_at: NOW,
        expires_at: NOW + 3_600,
        reviewer_key_id: REVIEWER_KEY_ID.into(),
        signature_hex: String::new(),
    };
    appr.sign(&reviewer_signer());
    appr
}

fn signed_contestation(id: &str, receipt: &ExecutionReceipt) -> ContestationRecord {
    let mut rec = ContestationRecord {
        schema: CONTESTATION_RECORD_SCHEMA.into(),
        contestation_id: id.into(),
        receipt_digest: receipt.leaf_digest_str(),
        policy_digest: receipt.active_candidate_digest.clone().unwrap(),
        activation_event_digest: receipt.activation_event_digest.clone().unwrap(),
        reason: "incorrect reconciliation total observed".into(),
        contested_at: NOW + 15,
        contester_key_id: CONTESTER_KEY_ID.into(),
        signature_hex: String::new(),
    };
    rec.sign(&contester_signer());
    rec
}

fn signed_correction(
    id: &str,
    contestation_digest: String,
    superseded_receipt_digest: String,
    policy_digest: String,
    corrected_content: &[u8],
) -> CorrectionRecord {
    let corrected_output_digest = format!(
        "blake3:{}",
        Digest32::blake3(b"AKG:ACTION:OUTPUT:v1\0", corrected_content).to_hex()
    );
    let mut rec = CorrectionRecord {
        schema: CORRECTION_RECORD_SCHEMA.into(),
        correction_id: id.into(),
        contestation_digest,
        superseded_receipt_digest,
        policy_digest,
        corrected_output_digest,
        justification: "recomputed verified total without overwriting disputed receipt".into(),
        corrected_at: NOW + 30,
        corrector_key_id: CORRECTOR_KEY_ID.into(),
        signature_hex: String::new(),
    };
    rec.sign(&corrector_signer());
    rec
}

#[tokio::test]
async fn c3_correction_supersedes_without_rewriting_history() {
    let dir = TestTempDir::new("supersede");
    let (state, app, dest_log) =
        setup_gateway(dir.path(), 0x11, vec![WorkIntentType::DraftDocument]).await;
    let target_a = target_hex(b"c3-doc-A");

    // 1. Obtain review digests, approve, and execute Action A -> 200 ALLOWED, 1 effect.
    let mut req_a = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_a.clone(),
        request_key: "c3-A-1".into(),
        claimed_created_at: NOW,
        action_input_hex: hex::encode(b"original-flawed-draft"),
        context_refs_hex: vec![],
        approval: None,
    };
    let (s_pend, val_pend) = post_json(&app, "/v1/governed/execute", &req_a).await;
    assert_eq!(s_pend, StatusCode::CONFLICT);
    let pend: GovernedExecuteResponse = serde_json::from_value(val_pend).unwrap();
    let policy_digest = pend.policy_digest.clone().unwrap();
    let activation_digest = pend.activation_event_digest.clone().unwrap();

    req_a.approval = Some(sign_exact_approval(
        &"11".repeat(16),
        &req_a,
        &policy_digest,
        &activation_digest,
    ));
    let (s_ok, val_ok) = post_json(&app, "/v1/governed/execute", &req_a).await;
    assert_eq!(s_ok, StatusCode::OK, "body={val_ok}");
    let resp_a: GovernedExecuteResponse = serde_json::from_value(val_ok).unwrap();
    assert_eq!(count_external_effects(&dest_log), 1);

    // 2. Admit ContestationRecord on receipt_A -> 200 CONTESTED.
    let contestation = signed_contestation(&"c1".repeat(16), &resp_a.receipt);
    let (s_c, val_c) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest {
            contestation: contestation.clone(),
        },
    )
    .await;
    assert_eq!(s_c, StatusCode::OK, "body={val_c}");
    let _resp_c: ContestReceiptResponse = serde_json::from_value(val_c).unwrap();

    // Snapshot bytes, digests, indices, and leaf count BEFORE correction.
    let (orig_pos_before, orig_bytes_before) =
        state.receipt_snapshot(&resp_a.receipt.leaf_hash()).unwrap();
    let (cont_pos_before, cont_bytes_before) = state
        .contestation_snapshot(&contestation.leaf_hash())
        .unwrap();
    let orig_digest_before = resp_a.receipt.leaf_digest_str();
    let cont_digest_before = contestation.leaf_digest_str();
    let (_, leaf_count_before) = state.mmr_root_and_count().unwrap();

    // 3. Submit signed CorrectionRecord via POST /v1/governed/correct.
    let correction = signed_correction(
        &"f1".repeat(16),
        cont_digest_before.clone(),
        orig_digest_before.clone(),
        policy_digest.clone(),
        b"EFFECT:corrected-reconciled-draft",
    );
    let (s_corr, val_corr) = post_json(
        &app,
        "/v1/governed/correct",
        &CorrectReceiptRequest {
            correction: correction.clone(),
        },
    )
    .await;
    assert_eq!(s_corr, StatusCode::OK, "body={val_corr}");
    let corr_resp: CorrectReceiptResponse = serde_json::from_value(val_corr).unwrap();
    assert_eq!(corr_resp.decision, "CORRECTED");

    // 4. Confirm EXACTLY ONE new leaf added and bit-for-bit preservation of receipt + contestation.
    let (_, leaf_count_after) = state.mmr_root_and_count().unwrap();
    assert_eq!(leaf_count_after, leaf_count_before + 1);
    assert_eq!(corr_resp.correction_leaf_index, leaf_count_before);
    assert_eq!(corr_resp.checkpoint.leaf_count, leaf_count_after);
    assert_eq!(state.mmr_counts().correction_records, 1);

    let (orig_pos_after, orig_bytes_after) =
        state.receipt_snapshot(&resp_a.receipt.leaf_hash()).unwrap();
    let (cont_pos_after, cont_bytes_after) = state
        .contestation_snapshot(&contestation.leaf_hash())
        .unwrap();
    assert_eq!(orig_pos_after, orig_pos_before);
    assert_eq!(orig_bytes_after, orig_bytes_before);
    assert_eq!(
        hex::decode(&corr_resp.original_receipt_bytes_hex).unwrap(),
        orig_bytes_before
    );
    assert_eq!(resp_a.receipt.leaf_digest_str(), orig_digest_before);

    assert_eq!(cont_pos_after, cont_pos_before);
    assert_eq!(cont_bytes_after, cont_bytes_before);
    assert_eq!(
        hex::decode(&corr_resp.contestation_bytes_hex).unwrap(),
        cont_bytes_before
    );
    assert_eq!(contestation.leaf_digest_str(), cont_digest_before);

    // 5. Verify ALL THREE records offline against the SAME posterior MmrCheckpoint.
    verify_offline_correction_bundle(
        &resp_a.receipt,
        &corr_resp.original_receipt_proof,
        &contestation,
        &corr_resp.contestation_proof,
        &corr_resp.correction,
        &corr_resp.correction_proof,
        &corr_resp.checkpoint,
        &trust_store(RECEIPT_KEY_ID, &receipt_signer()),
        &trust_store(CONTESTER_KEY_ID, &contester_signer()),
        &trust_store(CORRECTOR_KEY_ID, &corrector_signer()),
        &trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer()),
    )
    .expect("offline verification of receipt + contestation + correction must pass");

    // 6. Re-submit dependent action WITH a valid signed approval -> MUST STILL return
    //    409 CONTESTATION_ACTIVE, zero additional effects, and approval_2 STILL unconsumed!
    let mut req_after_corr = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_a,
        request_key: "c3-A-2-after-correction".into(),
        claimed_created_at: NOW + 40,
        action_input_hex: hex::encode(b"dependent-action-after-correction"),
        context_refs_hex: vec![orig_digest_before],
        approval: None,
    };
    let appr_2 = sign_exact_approval(
        &"22".repeat(16),
        &req_after_corr,
        &policy_digest,
        &activation_digest,
    );
    req_after_corr.approval = Some(appr_2.clone());

    let (s_blk, val_blk) = post_json(&app, "/v1/governed/execute", &req_after_corr).await;
    assert_eq!(s_blk, StatusCode::CONFLICT, "body={val_blk}");
    assert_eq!(val_blk["decision"], "CONTESTATION_ACTIVE");
    assert_eq!(
        count_external_effects(&dest_log),
        1,
        "correction alone must not unlock external effects before ResolutionRecord"
    );
    assert!(
        !state
            .is_review_approval_consumed(&appr_2.approval_id)
            .unwrap(),
        "approval must remain intact while contestation block persists after correction"
    );
}

#[tokio::test]
async fn c3_correction_without_verifiable_contestation_basis_fails() {
    let dir = TestTempDir::new("no-basis");
    let (state, app, _dest_log) = setup_gateway(dir.path(), 0x22, vec![]).await;

    // 1. Execute Action A and admit a real ContestationRecord.
    let (s_a, val_a) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_hex(b"basis-doc-A"),
            request_key: "basis-A".into(),
            claimed_created_at: NOW,
            action_input_hex: hex::encode(b"doc-A"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_a, StatusCode::OK);
    let resp_a: GovernedExecuteResponse = serde_json::from_value(val_a).unwrap();

    let contestation = signed_contestation(&"c2".repeat(16), &resp_a.receipt);
    let (s_c, _) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest {
            contestation: contestation.clone(),
        },
    )
    .await;
    assert_eq!(s_c, StatusCode::OK);

    let (root_before, count_before) = state.mmr_root_and_count().unwrap();
    let policy_digest = resp_a.receipt.active_candidate_digest.clone().unwrap();

    // Control A: Non-existent contestation_digest -> 404 MISSING_VERIFIABLE_BASIS.
    let bad_cont = signed_correction(
        &"e1".repeat(16),
        format!("blake3:{}", "00".repeat(32)),
        resp_a.receipt.leaf_digest_str(),
        policy_digest.clone(),
        b"corrected",
    );
    let (s1, v1) = post_json(
        &app,
        "/v1/governed/correct",
        &CorrectReceiptRequest {
            correction: bad_cont,
        },
    )
    .await;
    assert_eq!(s1, StatusCode::NOT_FOUND, "body={v1}");
    assert_eq!(v1["decision"], "REJECTED");
    assert_eq!(v1["error"], "MISSING_VERIFIABLE_BASIS");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_before, count_before)
    );

    // Control B: Divergent superseded_receipt_digest -> 403 INVALID_CORRECTION_BINDING.
    let bad_rec = signed_correction(
        &"e2".repeat(16),
        contestation.leaf_digest_str(),
        format!("blake3:{}", "11".repeat(32)),
        policy_digest.clone(),
        b"corrected",
    );
    let (s2, v2) = post_json(
        &app,
        "/v1/governed/correct",
        &CorrectReceiptRequest {
            correction: bad_rec,
        },
    )
    .await;
    assert_eq!(s2, StatusCode::FORBIDDEN, "body={v2}");
    assert_eq!(v2["decision"], "REJECTED");
    assert_eq!(v2["error"], "INVALID_CORRECTION_BINDING");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_before, count_before)
    );

    // Control C: Divergent policy_digest -> 403 INVALID_CORRECTION_BINDING.
    let bad_pol = signed_correction(
        &"e3".repeat(16),
        contestation.leaf_digest_str(),
        resp_a.receipt.leaf_digest_str(),
        format!("blake3:{}", "22".repeat(32)),
        b"corrected",
    );
    let (s3, v3) = post_json(
        &app,
        "/v1/governed/correct",
        &CorrectReceiptRequest {
            correction: bad_pol,
        },
    )
    .await;
    assert_eq!(s3, StatusCode::FORBIDDEN, "body={v3}");
    assert_eq!(v3["decision"], "REJECTED");
    assert_eq!(v3["error"], "INVALID_CORRECTION_BINDING");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_before, count_before)
    );

    // Control D: Invalid/untrusted corrector signature -> 403 INVALID_CORRECTION_RECORD.
    let mut bad_sig = signed_correction(
        &"e4".repeat(16),
        contestation.leaf_digest_str(),
        resp_a.receipt.leaf_digest_str(),
        policy_digest,
        b"corrected",
    );
    bad_sig.signature_hex = "00".repeat(64);
    let (s4, v4) = post_json(
        &app,
        "/v1/governed/correct",
        &CorrectReceiptRequest {
            correction: bad_sig,
        },
    )
    .await;
    assert_eq!(s4, StatusCode::FORBIDDEN, "body={v4}");
    assert_eq!(v4["decision"], "REJECTED");
    assert_eq!(v4["error"], "INVALID_CORRECTION_RECORD");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_before, count_before)
    );
    assert_eq!(state.mmr_counts().correction_records, 0);
}

#[tokio::test]
async fn c3_correction_alone_does_not_lift_active_contestation_block() {
    let dir = TestTempDir::new("still-blocked");
    let (state, app, dest_log) = setup_gateway(dir.path(), 0x33, vec![]).await;
    let target_a = target_hex(b"still-blocked-A");

    // 1. Execute Action A -> 200 ALLOWED, 1 effect.
    let (s_a, val_a) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_a.clone(),
            request_key: "sb-A".into(),
            claimed_created_at: NOW,
            action_input_hex: hex::encode(b"initial-A"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_a, StatusCode::OK);
    let resp_a: GovernedExecuteResponse = serde_json::from_value(val_a).unwrap();
    assert_eq!(count_external_effects(&dest_log), 1);

    // 2. Contest receipt_A -> 200 CONTESTED.
    let contestation = signed_contestation(&"c3".repeat(16), &resp_a.receipt);
    let (s_c, _) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest {
            contestation: contestation.clone(),
        },
    )
    .await;
    assert_eq!(s_c, StatusCode::OK);

    // 3. Admit valid CorrectionRecord -> 200 CORRECTED.
    let correction = signed_correction(
        &"f3".repeat(16),
        contestation.leaf_digest_str(),
        resp_a.receipt.leaf_digest_str(),
        resp_a.receipt.active_candidate_digest.clone().unwrap(),
        b"EFFECT:corrected-A",
    );
    let (s_corr, val_corr) = post_json(
        &app,
        "/v1/governed/correct",
        &CorrectReceiptRequest {
            correction: correction.clone(),
        },
    )
    .await;
    assert_eq!(s_corr, StatusCode::OK, "body={val_corr}");
    let corr_resp: CorrectReceiptResponse = serde_json::from_value(val_corr).unwrap();
    assert_eq!(corr_resp.decision, "CORRECTED");

    // 4a. Attempt dependent action on same target omitting context_refs_hex -> STILL 409 CONTESTATION_ACTIVE.
    let (s_blk, val_blk) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_a,
            request_key: "sb-after-corr".into(),
            claimed_created_at: NOW + 50,
            action_input_hex: hex::encode(b"try-proceed-after-correction"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_blk, StatusCode::CONFLICT, "body={val_blk}");
    let resp_blk: GovernedExecuteResponse = serde_json::from_value(val_blk).unwrap();
    assert_eq!(resp_blk.decision, "CONTESTATION_ACTIVE");
    assert!(matches!(
        resp_blk.receipt.outcome,
        ReceiptOutcome::ContestedBlocked { .. }
    ));
    assert_eq!(count_external_effects(&dest_log), 1);

    // 5. Offline verification validates BOTH the correction chain AND the post-correction block
    //    against the same final posterior checkpoint.
    let orig_proof = state
        .prove_leaf(corr_resp.original_receipt_leaf_index)
        .unwrap();
    let cont_proof = state.prove_leaf(corr_resp.contestation_leaf_index).unwrap();
    let corr_proof = state.prove_leaf(corr_resp.correction_leaf_index).unwrap();

    verify_offline_correction_bundle(
        &resp_a.receipt,
        &orig_proof,
        &contestation,
        &cont_proof,
        &correction,
        &corr_proof,
        &resp_blk.checkpoint,
        &trust_store(RECEIPT_KEY_ID, &receipt_signer()),
        &trust_store(CONTESTER_KEY_ID, &contester_signer()),
        &trust_store(CORRECTOR_KEY_ID, &corrector_signer()),
        &trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer()),
    )
    .expect("correction chain verifies offline against final checkpoint");

    verify_offline_contestation_block_bundle(
        &resp_a.receipt,
        &orig_proof,
        &contestation,
        &cont_proof,
        &resp_blk.receipt,
        &resp_blk.receipt_proof,
        &resp_blk.checkpoint,
        &trust_store(RECEIPT_KEY_ID, &receipt_signer()),
        &trust_store(CONTESTER_KEY_ID, &contester_signer()),
        &trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer()),
    )
    .expect("post-correction ContestedBlocked refusal verifies offline against final checkpoint");
}
