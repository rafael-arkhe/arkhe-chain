#![cfg(feature = "sqlite-activation")]
//! C5 & C6 — Append-only dispute resolution (`ResolutionRecord`), effective
//! authority separation, scoped controlled resumption under a single
//! consistency boundary, non-replay (including `ContestationUpheld`), and
//! complete offline verification with strict causal MMR ordering.

use arkhe_core::work::{RequestIdentity, WorkIntent, WorkIntentType};
use arkhe_core::Digest32;
use arkhe_governance::activation::{candidate_digest, Proposal, TargetKind, PROPOSAL_SCHEMA};
use arkhe_governance::policy_bundle::{
    sign_policy_bundle, PolicyPayload, SignedPolicyBundle, TrustStore,
};
use arkhe_kernel::activation_sqlite::SqliteActivationStore;
use arkhe_kernel::governed_execution::{
    compute_action_digest, verify_offline_resolution_bundle, ActivePolicyDocument,
    ContestationRecord, CorrectionRecord, ExecutionReceipt, OfflineVerifyError, ReceiptOutcome,
    ResolutionOutcome, ResolutionRecord, ReviewApproval, ACTIVE_POLICY_SCHEMA,
    CONTESTATION_RECORD_SCHEMA, CORRECTION_RECORD_SCHEMA, RESOLUTION_RECORD_SCHEMA,
    REVIEW_APPROVAL_SCHEMA,
};
use arkhe_runtime::governed_gateway::{
    router, ActivatePolicyRequest, ContestReceiptRequest, ContestReceiptResponse,
    CorrectReceiptRequest, CorrectReceiptResponse, GovernedExecuteRequest, GovernedExecuteResponse,
    GovernedGatewayState, ResolveReceiptRequest, ResolveReceiptResponse,
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

const TOKEN: &str = "c5-resolution-test-token";
const ACTOR: &str = "agent-c5-client";
const POLICY_ID: &str = "arkhe-c5-policy";
const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const POLICY_KEY_ID: &str = "dev-founder-policy-key";
const REVIEWER_KEY_ID: &str = "dev-human-reviewer-key";
const CONTESTER_KEY_ID: &str = "dev-auditor-contester-key";
const CORRECTOR_KEY_ID: &str = "dev-remediator-corrector-key";
const RESOLVER_KEY_ID: &str = "dev-arbiter-resolver-key";
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
            std::env::temp_dir().join(format!("arkhe-c5-{prefix}-{}-{n}", std::process::id()));
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

fn resolver_signer() -> SigningKey {
    SigningKey::from_bytes(&[77; 32])
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
    Digest32::blake3(b"C5:TARGET\0", label).to_hex()
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

async fn setup_gateway_with_trusts(
    dir: &Path,
    nonce: u8,
    review_required_intents: Vec<WorkIntentType>,
    contester_trust: TrustStore,
    corrector_trust: TrustStore,
    resolver_trust: TrustStore,
) -> (Arc<GovernedGatewayState>, axum::Router, PathBuf) {
    let db_path = dir.join(format!("c5_activation_{nonce}.sqlite"));
    let dest_log = dir.join(format!("c5_external_effects_{nonce}.jsonl"));
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
        .with_contester_trust(contester_trust)
        .with_corrector_trust(corrector_trust)
        .with_resolver_trust(resolver_trust),
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

async fn setup_gateway(
    dir: &Path,
    nonce: u8,
    review_required_intents: Vec<WorkIntentType>,
) -> (Arc<GovernedGatewayState>, axum::Router, PathBuf) {
    setup_gateway_with_trusts(
        dir,
        nonce,
        review_required_intents,
        trust_store(CONTESTER_KEY_ID, &contester_signer()),
        trust_store(CORRECTOR_KEY_ID, &corrector_signer()),
        trust_store(RESOLVER_KEY_ID, &resolver_signer()),
    )
    .await
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

fn hex_id(tag: &str) -> String {
    Digest32::blake3(b"C5:ID\0", tag.as_bytes()).to_hex()[..32].to_string()
}

fn sign_approval(
    approval_tag: &str,
    action_digest: &str,
    policy_digest: &str,
    activation_event_digest: &str,
) -> ReviewApproval {
    let mut approval = ReviewApproval {
        schema: REVIEW_APPROVAL_SCHEMA.into(),
        approval_id: hex_id(approval_tag),
        action_digest: action_digest.into(),
        policy_digest: policy_digest.into(),
        activation_event_digest: activation_event_digest.into(),
        issued_at: NOW,
        expires_at: NOW + 600,
        reviewer_key_id: REVIEWER_KEY_ID.into(),
        signature_hex: String::new(),
    };
    approval.sign(&reviewer_signer());
    approval
}

fn sign_contestation(
    contestation_tag: &str,
    receipt: &ExecutionReceipt,
    reason: &str,
) -> ContestationRecord {
    let mut rec = ContestationRecord {
        schema: CONTESTATION_RECORD_SCHEMA.into(),
        contestation_id: hex_id(contestation_tag),
        receipt_digest: receipt.leaf_digest_str(),
        policy_digest: receipt
            .active_candidate_digest
            .clone()
            .expect("active policy digest"),
        activation_event_digest: receipt
            .activation_event_digest
            .clone()
            .expect("activation event digest"),
        reason: reason.into(),
        contested_at: NOW + 10,
        contester_key_id: CONTESTER_KEY_ID.into(),
        signature_hex: String::new(),
    };
    rec.sign(&contester_signer());
    rec
}

fn sign_correction(
    correction_tag: &str,
    receipt: &ExecutionReceipt,
    contestation: &ContestationRecord,
    corrected_payload: &str,
    reason: &str,
) -> CorrectionRecord {
    let mut rec = CorrectionRecord {
        schema: CORRECTION_RECORD_SCHEMA.into(),
        correction_id: hex_id(correction_tag),
        contestation_digest: contestation.leaf_digest_str(),
        superseded_receipt_digest: receipt.leaf_digest_str(),
        policy_digest: receipt
            .active_candidate_digest
            .clone()
            .expect("active policy digest"),
        corrected_output_digest: format!(
            "blake3:{}",
            Digest32::blake3(b"C5:CORRECTED:CONTENT\0", corrected_payload.as_bytes()).to_hex()
        ),
        justification: reason.into(),
        corrected_at: NOW + 20,
        corrector_key_id: CORRECTOR_KEY_ID.into(),
        signature_hex: String::new(),
    };
    rec.sign(&corrector_signer());
    rec
}

#[allow(clippy::too_many_arguments)]
fn sign_resolution(
    resolution_tag: &str,
    receipt: &ExecutionReceipt,
    contestation: &ContestationRecord,
    correction: Option<&CorrectionRecord>,
    outcome: ResolutionOutcome,
    reason: &str,
    key_id: &str,
    signer: &SigningKey,
) -> ResolutionRecord {
    let mut rec = ResolutionRecord {
        schema: RESOLUTION_RECORD_SCHEMA.into(),
        resolution_id: hex_id(resolution_tag),
        contestation_digest: contestation.leaf_digest_str(),
        receipt_digest: receipt.leaf_digest_str(),
        policy_digest: receipt
            .active_candidate_digest
            .clone()
            .expect("active policy digest"),
        correction_digest: correction.map(CorrectionRecord::leaf_digest_str),
        outcome,
        rationale: reason.into(),
        resolved_at: NOW + 30,
        resolver_key_id: key_id.into(),
        signature_hex: String::new(),
    };
    rec.sign(signer);
    rec
}

/// C5 + C6 primary lifecycle test:
/// - Full HTTP flow with mandatory review policy:
///   execute (approved) -> contest -> blocked dependent action (preserving approval_2)
///   -> correct -> resolve (`ResolvedWithSupersession`).
/// - Proves exactly 1 `ResolutionRecord` leaf appended, prior receipt/contestation/correction
///   bytes, digests, and leaf indices untouched bit-for-bit.
/// - Proves `verify_offline_resolution_bundle()` succeeds for all 4 records against one
///   posterior checkpoint AND rejects causal order violations (`CausalOrderViolation`)
///   and authority conflicts (`ConflictingAuthority`).
/// - Proves controlled resumption: after resolution, executing WITHOUT approval still
///   returns `409 REVIEW_REQUIRED` (0 effects), and executing WITH preserved `approval_2`
///   succeeds (`200 ALLOWED`, effects == 2, `approval_2` consumed).
#[tokio::test]
async fn c5_resolution_appends_record_preserves_history_and_allows_controlled_resumption() {
    let dir = TestTempDir::new("lifecycle");
    let (state, app, dest_log) =
        setup_gateway(dir.path(), 0x51, vec![WorkIntentType::DraftDocument]).await;

    let target_a = target_hex(b"target-alpha");

    // 1. Probe review challenge for initial execution on target_A, then approve and execute.
    let mut init_req = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_a.clone(),
        request_key: "c5-init-1".into(),
        claimed_created_at: NOW,
        action_input_hex: hex::encode(b"initial-draft-v1"),
        context_refs_hex: vec![],
        approval: None,
    };
    let (s_rev, body_rev) = post_json(&app, "/v1/governed/execute", &init_req).await;
    assert_eq!(
        s_rev,
        StatusCode::CONFLICT,
        "expected REVIEW_REQUIRED: {body_rev}"
    );
    let rev_resp: GovernedExecuteResponse = serde_json::from_value(body_rev).unwrap();
    assert_eq!(rev_resp.decision, "REVIEW_REQUIRED");

    let approval_1 = sign_approval(
        "c5-appr-1",
        rev_resp.action_digest.as_deref().unwrap(),
        rev_resp.policy_digest.as_deref().unwrap(),
        rev_resp.activation_event_digest.as_deref().unwrap(),
    );
    init_req.approval = Some(approval_1);

    let (s_exec, body_exec) = post_json(&app, "/v1/governed/execute", &init_req).await;
    assert_eq!(
        s_exec,
        StatusCode::OK,
        "initial execution failed: {body_exec}"
    );
    let orig_resp: GovernedExecuteResponse = serde_json::from_value(body_exec).unwrap();
    assert_eq!(orig_resp.decision, "ALLOWED");
    assert_eq!(count_external_effects(&dest_log), 1);

    let orig_receipt = orig_resp.receipt.clone();
    let orig_leaf_hash = orig_receipt.leaf_hash();
    let orig_digest_before = orig_receipt.leaf_digest_str();
    let (orig_idx_before, orig_bytes_before) = state
        .receipt_snapshot(&orig_leaf_hash)
        .expect("original receipt stored");

    // 2. Contest the original receipt via HTTP.
    let contestation = sign_contestation(
        "c5-cont-1",
        &orig_receipt,
        "audit found stale calculation in initial-draft-v1",
    );
    let (s_cont, body_cont) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest {
            contestation: contestation.clone(),
        },
    )
    .await;
    assert_eq!(s_cont, StatusCode::OK, "contestation failed: {body_cont}");
    let _cont_resp: ContestReceiptResponse = serde_json::from_value(body_cont).unwrap();

    let cont_leaf_hash = contestation.leaf_hash();
    let cont_digest_before = contestation.leaf_digest_str();
    let (cont_idx_before, cont_bytes_before) = state
        .contestation_snapshot(&cont_leaf_hash)
        .expect("contestation stored");

    // 3. Submit dependent action with a valid single-use approval_2 -> blocked by contestation,
    //    zero external effects, approval_2 preserved unconsumed.
    let mut dep_req = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_a.clone(),
        request_key: "c5-dep-2".into(),
        claimed_created_at: NOW + 15,
        action_input_hex: hex::encode(b"followup-action-v2"),
        context_refs_hex: vec![orig_digest_before.clone()],
        approval: None,
    };
    let dep_action_digest = compute_request_action_digest(&dep_req);
    let approval_2 = sign_approval(
        "c5-appr-2",
        &dep_action_digest,
        orig_receipt.active_candidate_digest.as_deref().unwrap(),
        orig_receipt.activation_event_digest.as_deref().unwrap(),
    );
    dep_req.approval = Some(approval_2.clone());

    let (s_blk, body_blk) = post_json(&app, "/v1/governed/execute", &dep_req).await;
    assert_eq!(
        s_blk,
        StatusCode::CONFLICT,
        "expected CONTESTATION_ACTIVE: {body_blk}"
    );
    let blk_resp: GovernedExecuteResponse = serde_json::from_value(body_blk).unwrap();
    assert_eq!(blk_resp.decision, "CONTESTATION_ACTIVE");
    assert_eq!(count_external_effects(&dest_log), 1);
    assert!(
        !state
            .is_review_approval_consumed(&approval_2.approval_id)
            .unwrap(),
        "approval_2 must remain unconsumed while contestation is active"
    );

    // 4. Admit superseding correction via HTTP.
    let correction = sign_correction(
        "c5-corr-1",
        &orig_receipt,
        &contestation,
        "recalculated-clean-draft-v2",
        "remediated stale calculation with verified figures",
    );
    let (s_corr, body_corr) = post_json(
        &app,
        "/v1/governed/correct",
        &CorrectReceiptRequest {
            correction: correction.clone(),
        },
    )
    .await;
    assert_eq!(s_corr, StatusCode::OK, "correction failed: {body_corr}");
    let _corr_resp: CorrectReceiptResponse = serde_json::from_value(body_corr).unwrap();

    let corr_leaf_hash = correction.leaf_hash();
    let corr_digest_before = correction.leaf_digest_str();
    let (corr_idx_before, corr_bytes_before) = state
        .correction_snapshot(&corr_leaf_hash)
        .expect("correction stored");

    let (_, leaf_count_before_res) = state.mmr_root_and_count().unwrap();
    let counts_before_res = state.mmr_counts();
    assert_eq!(counts_before_res.resolution_records, 0);

    // 5. Admit ResolutionRecord (`ResolvedWithSupersession`) via HTTP using separate resolver authority.
    let resolution = sign_resolution(
        "c5-res-1",
        &orig_receipt,
        &contestation,
        Some(&correction),
        ResolutionOutcome::ResolvedWithSupersession,
        "arbiter verified superseding correction and closed dispute",
        RESOLVER_KEY_ID,
        &resolver_signer(),
    );
    let (s_res, body_res) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: resolution.clone(),
        },
    )
    .await;
    assert_eq!(s_res, StatusCode::OK, "resolution failed: {body_res}");
    let res_resp: ResolveReceiptResponse = serde_json::from_value(body_res).unwrap();
    assert_eq!(res_resp.decision, "RESOLVED");
    assert_eq!(
        res_resp.outcome,
        ResolutionOutcome::ResolvedWithSupersession
    );

    // Exactly 1 leaf added (ResolutionRecord).
    let (_, leaf_count_after_res) = state.mmr_root_and_count().unwrap();
    assert_eq!(
        leaf_count_after_res,
        leaf_count_before_res + 1,
        "resolution must append exactly 1 MMR leaf"
    );
    assert_eq!(state.mmr_counts().resolution_records, 1);

    // Historical records bit-for-bit untouched (bytes, digests, leaf indices).
    let (orig_idx_after, orig_bytes_after) = state.receipt_snapshot(&orig_leaf_hash).unwrap();
    let (cont_idx_after, cont_bytes_after) = state.contestation_snapshot(&cont_leaf_hash).unwrap();
    let (corr_idx_after, corr_bytes_after) = state.correction_snapshot(&corr_leaf_hash).unwrap();

    assert_eq!(orig_idx_after, orig_idx_before);
    assert_eq!(orig_bytes_after, orig_bytes_before);
    assert_eq!(orig_receipt.leaf_digest_str(), orig_digest_before);
    assert_eq!(
        hex::decode(&res_resp.original_receipt_bytes_hex).unwrap(),
        orig_bytes_before
    );

    assert_eq!(cont_idx_after, cont_idx_before);
    assert_eq!(cont_bytes_after, cont_bytes_before);
    assert_eq!(contestation.leaf_digest_str(), cont_digest_before);
    assert_eq!(
        hex::decode(&res_resp.contestation_bytes_hex).unwrap(),
        cont_bytes_before
    );

    assert_eq!(corr_idx_after, corr_idx_before);
    assert_eq!(corr_bytes_after, corr_bytes_before);
    assert_eq!(correction.leaf_digest_str(), corr_digest_before);
    assert_eq!(
        hex::decode(res_resp.correction_bytes_hex.as_deref().unwrap()).unwrap(),
        corr_bytes_before
    );

    // Strict causal order in the MMR log.
    assert!(res_resp.original_receipt_leaf_index < res_resp.contestation_leaf_index);
    assert!(res_resp.contestation_leaf_index < res_resp.correction_leaf_index.unwrap());
    assert!(res_resp.correction_leaf_index.unwrap() < res_resp.resolution_leaf_index);

    // 6. Complete C6 offline verification against the single posterior checkpoint.
    let receipt_trust = trust_store(RECEIPT_KEY_ID, &receipt_signer());
    let contester_trust = trust_store(CONTESTER_KEY_ID, &contester_signer());
    let corrector_trust = trust_store(CORRECTOR_KEY_ID, &corrector_signer());
    let resolver_trust = trust_store(RESOLVER_KEY_ID, &resolver_signer());
    let checkpoint_trust = trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer());

    let corr_proof = res_resp.correction_proof.as_ref().unwrap();
    verify_offline_resolution_bundle(
        &orig_receipt,
        &res_resp.original_receipt_proof,
        &contestation,
        &res_resp.contestation_proof,
        Some((&correction, corr_proof)),
        &res_resp.resolution,
        &res_resp.resolution_proof,
        &res_resp.checkpoint,
        &receipt_trust,
        &contester_trust,
        &corrector_trust,
        &resolver_trust,
        &checkpoint_trust,
    )
    .expect("C6 offline verification of complete 4-record dispute bundle must pass");

    // C6 negative control: violating strict causal leaf-index order must fail.
    let err_order = verify_offline_resolution_bundle(
        &orig_receipt,
        &res_resp.contestation_proof, // swapped: receipt_idx >= contestation_idx
        &contestation,
        &res_resp.original_receipt_proof,
        Some((&correction, corr_proof)),
        &res_resp.resolution,
        &res_resp.resolution_proof,
        &res_resp.checkpoint,
        &receipt_trust,
        &contester_trust,
        &corrector_trust,
        &resolver_trust,
        &checkpoint_trust,
    );
    assert_eq!(err_order, Err(OfflineVerifyError::CausalOrderViolation));

    // C6 negative control: omitting required correction evidence for ResolvedWithSupersession fails.
    let err_missing_corr = verify_offline_resolution_bundle(
        &orig_receipt,
        &res_resp.original_receipt_proof,
        &contestation,
        &res_resp.contestation_proof,
        None,
        &res_resp.resolution,
        &res_resp.resolution_proof,
        &res_resp.checkpoint,
        &receipt_trust,
        &contester_trust,
        &corrector_trust,
        &resolver_trust,
        &checkpoint_trust,
    );
    assert_eq!(
        err_missing_corr,
        Err(OfflineVerifyError::ResolutionBindingMismatch(
            "correction_required_for_supersession"
        ))
    );

    // C6 negative control: tampering with contestation fails MMR inclusion offline.
    let mut tampered_cont = contestation.clone();
    tampered_cont.reason = "tampered after checkpoint".into();
    tampered_cont.sign(&contester_signer());
    let err_tampered = verify_offline_resolution_bundle(
        &orig_receipt,
        &res_resp.original_receipt_proof,
        &tampered_cont,
        &res_resp.contestation_proof,
        Some((&correction, corr_proof)),
        &res_resp.resolution,
        &res_resp.resolution_proof,
        &res_resp.checkpoint,
        &receipt_trust,
        &contester_trust,
        &corrector_trust,
        &resolver_trust,
        &checkpoint_trust,
    );
    assert_eq!(err_tampered, Err(OfflineVerifyError::ContestationNotInMmr));

    // 7. Controlled resumption:
    //    (a) Without approval -> STILL blocked by mandatory review (`409 REVIEW_REQUIRED`), 0 new effects!
    let mut dep_without_approval = dep_req.clone();
    dep_without_approval.approval = None;
    let (s_need_rev, body_need_rev) =
        post_json(&app, "/v1/governed/execute", &dep_without_approval).await;
    assert_eq!(
        s_need_rev,
        StatusCode::CONFLICT,
        "resumption without approval must still hit mandatory review: {body_need_rev}"
    );
    let need_rev_resp: GovernedExecuteResponse = serde_json::from_value(body_need_rev).unwrap();
    assert_eq!(need_rev_resp.decision, "REVIEW_REQUIRED");
    assert_eq!(count_external_effects(&dest_log), 1);

    //    (b) With the previously preserved single-use approval_2 -> NOW succeeds (`200 ALLOWED`)!
    let (s_resume, body_resume) = post_json(&app, "/v1/governed/execute", &dep_req).await;
    assert_eq!(
        s_resume,
        StatusCode::OK,
        "controlled resumption with valid preserved approval_2 must succeed: {body_resume}"
    );
    let resume_resp: GovernedExecuteResponse = serde_json::from_value(body_resume).unwrap();
    assert_eq!(resume_resp.decision, "ALLOWED");
    assert!(matches!(
        resume_resp.receipt.outcome,
        ReceiptOutcome::Executed {
            approval_id: Some(ref id),
            ..
        } if id == &approval_2.approval_id
    ));
    assert_eq!(count_external_effects(&dest_log), 2);
    assert!(
        state
            .is_review_approval_consumed(&approval_2.approval_id)
            .unwrap(),
        "approval_2 must now be durably consumed after controlled resumption"
    );
}

/// C5 negative controls:
/// 1. Non-existent `contestation_digest` -> `404 MISSING_VERIFIABLE_BASIS`.
/// 2. `ResolvedWithSupersession` missing `correction_digest` -> `403 INVALID_RESOLUTION_BINDING`.
/// 3. `ResolvedWithSupersession` with non-existent `correction_digest` -> `404 MISSING_VERIFIABLE_BASIS`.
/// 4. Tampered `receipt_digest` -> `403 INVALID_RESOLUTION_BINDING`.
/// 5. Unauthorized resolver signer -> `403 INVALID_RESOLUTION_RECORD`.
/// 6. Effective authority separation: even if the SAME Ed25519 public key is misconfigured
///    in `contester_trust` (or `corrector_trust`) AND `resolver_trust` under different key IDs,
///    admission MUST reject with `403 CONFLICTING_AUTHORITY` and keep MMR intact.
/// 7. Replay after terminal resolution: same `resolution_id` -> `409 RESOLUTION_ALREADY_RECORDED`,
///    and new `resolution_id` on already-resolved contestation -> `409 CONTESTATION_ALREADY_RESOLVED`.
#[tokio::test]
async fn c5_resolution_validation_authority_separation_and_replay_protection() {
    let dir = TestTempDir::new("validation");
    let (state, app, _dest_log) = setup_gateway(dir.path(), 0x52, vec![]).await;

    let target_a = target_hex(b"target-validation");
    let (s_exec, body_exec) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_a,
            request_key: "c5-val-1".into(),
            claimed_created_at: NOW,
            action_input_hex: hex::encode(b"val-action"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_exec, StatusCode::OK);
    let orig_receipt = serde_json::from_value::<GovernedExecuteResponse>(body_exec)
        .unwrap()
        .receipt;

    let contestation = sign_contestation("c5-val-cont", &orig_receipt, "bad output");
    let (s_cont, _) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest {
            contestation: contestation.clone(),
        },
    )
    .await;
    assert_eq!(s_cont, StatusCode::OK);

    let correction = sign_correction(
        "c5-val-corr",
        &orig_receipt,
        &contestation,
        "fixed-output",
        "fixed",
    );
    let (s_corr, _) = post_json(
        &app,
        "/v1/governed/correct",
        &CorrectReceiptRequest {
            correction: correction.clone(),
        },
    )
    .await;
    assert_eq!(s_corr, StatusCode::OK);

    let (root_before, count_before) = state.mmr_root_and_count().unwrap();

    // Control 1: non-existent contestation_digest -> 404.
    let mut bad_cont = sign_resolution(
        "c5-neg-1",
        &orig_receipt,
        &contestation,
        Some(&correction),
        ResolutionOutcome::ResolvedWithSupersession,
        "missing contestation",
        RESOLVER_KEY_ID,
        &resolver_signer(),
    );
    bad_cont.contestation_digest = format!("blake3:{}", "11".repeat(32));
    bad_cont.sign(&resolver_signer());
    let (s, v) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: bad_cont,
        },
    )
    .await;
    assert_eq!(s, StatusCode::NOT_FOUND, "expected 404: {v}");
    assert_eq!(v["error"], "MISSING_VERIFIABLE_BASIS");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_before, count_before)
    );

    // Control 2: ResolvedWithSupersession without correction_digest -> 403.
    let missing_corr = sign_resolution(
        "c5-neg-2",
        &orig_receipt,
        &contestation,
        None,
        ResolutionOutcome::ResolvedWithSupersession,
        "missing correction",
        RESOLVER_KEY_ID,
        &resolver_signer(),
    );
    let (s, v) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: missing_corr,
        },
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN, "expected 403: {v}");
    assert_eq!(v["error"], "INVALID_RESOLUTION_BINDING");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_before, count_before)
    );

    // Control 3: ResolvedWithSupersession with non-existent correction_digest -> 404.
    let mut bad_corr = sign_resolution(
        "c5-neg-3",
        &orig_receipt,
        &contestation,
        Some(&correction),
        ResolutionOutcome::ResolvedWithSupersession,
        "unknown correction",
        RESOLVER_KEY_ID,
        &resolver_signer(),
    );
    bad_corr.correction_digest = Some(format!("blake3:{}", "22".repeat(32)));
    bad_corr.sign(&resolver_signer());
    let (s, v) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: bad_corr,
        },
    )
    .await;
    assert_eq!(s, StatusCode::NOT_FOUND, "expected 404: {v}");
    assert_eq!(v["error"], "MISSING_VERIFIABLE_BASIS");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_before, count_before)
    );

    // Control 4: tampered receipt_digest -> 403.
    let mut bad_rec = sign_resolution(
        "c5-neg-4",
        &orig_receipt,
        &contestation,
        Some(&correction),
        ResolutionOutcome::ResolvedWithSupersession,
        "wrong receipt",
        RESOLVER_KEY_ID,
        &resolver_signer(),
    );
    bad_rec.receipt_digest = format!("blake3:{}", "33".repeat(32));
    bad_rec.sign(&resolver_signer());
    let (s, v) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: bad_rec,
        },
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN, "expected 403: {v}");
    assert_eq!(v["error"], "INVALID_RESOLUTION_BINDING");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_before, count_before)
    );

    // Control 5: unauthorized signer (not in resolver_trust) -> 403.
    let rogue_signer = SigningKey::from_bytes(&[99; 32]);
    let rogue_res = sign_resolution(
        "c5-neg-5",
        &orig_receipt,
        &contestation,
        Some(&correction),
        ResolutionOutcome::ResolvedWithSupersession,
        "unauthorized signer",
        "rogue-resolver-key",
        &rogue_signer,
    );
    let (s, v) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: rogue_res,
        },
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN, "expected 403: {v}");
    assert_eq!(v["error"], "INVALID_RESOLUTION_RECORD");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_before, count_before)
    );

    // Control 6: Misconfigured shared public key between contester/corrector and resolver
    // under DIFFERENT key IDs -> MUST still be rejected with 403 CONFLICTING_AUTHORITY.
    {
        let mut misconfigured_resolver_trust = TrustStore::new();
        misconfigured_resolver_trust
            .insert_signing("aliased-contester-as-resolver", &contester_signer())
            .unwrap();
        misconfigured_resolver_trust
            .insert_signing("aliased-corrector-as-resolver", &corrector_signer())
            .unwrap();
        let (state_m, app_m, _) = setup_gateway_with_trusts(
            dir.path(),
            0x53,
            vec![],
            trust_store(CONTESTER_KEY_ID, &contester_signer()),
            trust_store(CORRECTOR_KEY_ID, &corrector_signer()),
            misconfigured_resolver_trust,
        )
        .await;

        let (se, be) = post_json(
            &app_m,
            "/v1/governed/execute",
            &GovernedExecuteRequest {
                policy_id: POLICY_ID.into(),
                intent_type: WorkIntentType::DraftDocument,
                target_hex: target_hex(b"target-shared-key"),
                request_key: "c5-sk-1".into(),
                claimed_created_at: NOW,
                action_input_hex: hex::encode(b"sk-action"),
                context_refs_hex: vec![],
                approval: None,
            },
        )
        .await;
        assert_eq!(se, StatusCode::OK);
        let rec_m = serde_json::from_value::<GovernedExecuteResponse>(be)
            .unwrap()
            .receipt;
        let cont_m = sign_contestation("c5-sk-cont", &rec_m, "dispute");
        assert_eq!(
            post_json(
                &app_m,
                "/v1/governed/contest",
                &ContestReceiptRequest {
                    contestation: cont_m.clone(),
                },
            )
            .await
            .0,
            StatusCode::OK
        );
        let corr_m = sign_correction("c5-sk-corr", &rec_m, &cont_m, "fix", "fix");
        assert_eq!(
            post_json(
                &app_m,
                "/v1/governed/correct",
                &CorrectReceiptRequest {
                    correction: corr_m.clone(),
                },
            )
            .await
            .0,
            StatusCode::OK
        );
        let (rm_before, cm_before) = state_m.mmr_root_and_count().unwrap();

        // Contester trying to self-resolve under a different key_id:
        let self_res_contester = sign_resolution(
            "c5-sk-res-1",
            &rec_m,
            &cont_m,
            Some(&corr_m),
            ResolutionOutcome::ResolvedWithSupersession,
            "contester attempting self-resolution via alias",
            "aliased-contester-as-resolver",
            &contester_signer(),
        );
        let (s_sc, v_sc) = post_json(
            &app_m,
            "/v1/governed/resolve",
            &ResolveReceiptRequest {
                resolution: self_res_contester,
            },
        )
        .await;
        assert_eq!(s_sc, StatusCode::FORBIDDEN, "expected 403: {v_sc}");
        assert_eq!(v_sc["error"], "CONFLICTING_AUTHORITY");
        assert_eq!(
            state_m.mmr_root_and_count().unwrap(),
            (rm_before, cm_before)
        );

        // Corrector trying to self-approve their own correction under a different key_id:
        let self_res_corrector = sign_resolution(
            "c5-sk-res-2",
            &rec_m,
            &cont_m,
            Some(&corr_m),
            ResolutionOutcome::ResolvedWithSupersession,
            "corrector attempting self-resolution via alias",
            "aliased-corrector-as-resolver",
            &corrector_signer(),
        );
        let (s_sk, v_sk) = post_json(
            &app_m,
            "/v1/governed/resolve",
            &ResolveReceiptRequest {
                resolution: self_res_corrector,
            },
        )
        .await;
        assert_eq!(s_sk, StatusCode::FORBIDDEN, "expected 403: {v_sk}");
        assert_eq!(v_sk["error"], "CONFLICTING_AUTHORITY");
        assert_eq!(
            state_m.mmr_root_and_count().unwrap(),
            (rm_before, cm_before)
        );
    }

    // Control 7: Admit valid terminal resolution, then prove replay & re-resolution are rejected.
    let valid_res = sign_resolution(
        "c5-val-res-ok",
        &orig_receipt,
        &contestation,
        Some(&correction),
        ResolutionOutcome::ResolvedWithSupersession,
        "valid resolution",
        RESOLVER_KEY_ID,
        &resolver_signer(),
    );
    let (s_ok, _) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: valid_res.clone(),
        },
    )
    .await;
    assert_eq!(s_ok, StatusCode::OK);
    let (root_after_ok, count_after_ok) = state.mmr_root_and_count().unwrap();
    assert_eq!(count_after_ok, count_before + 1);

    // 7a: Exact replay of same resolution_id -> 409 RESOLUTION_ALREADY_RECORDED.
    let (s_rep, v_rep) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: valid_res,
        },
    )
    .await;
    assert_eq!(s_rep, StatusCode::CONFLICT, "expected 409: {v_rep}");
    assert_eq!(v_rep["error"], "RESOLUTION_ALREADY_RECORDED");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_after_ok, count_after_ok)
    );

    // 7b: Distinct resolution_id on already-resolved contestation -> 409 CONTESTATION_ALREADY_RESOLVED.
    let second_res = sign_resolution(
        "c5-val-res-duplicate",
        &orig_receipt,
        &contestation,
        None,
        ResolutionOutcome::ContestationDismissed,
        "attempted second resolution",
        RESOLVER_KEY_ID,
        &resolver_signer(),
    );
    let (s_dup, v_dup) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: second_res,
        },
    )
    .await;
    assert_eq!(s_dup, StatusCode::CONFLICT, "expected 409: {v_dup}");
    assert_eq!(v_dup["error"], "CONTESTATION_ALREADY_RESOLVED");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_after_ok, count_after_ok)
    );
}

/// C5.3 & C5.4 edge-case invariants:
/// - Part A: `ContestationUpheld` keeps the contestation active, rejects exact replay
///   of the same `ResolutionRecord` (`409 RESOLUTION_ALREADY_RECORDED`, MMR intact),
///   and allows a distinct later `ResolutionRecord` (`ResolvedWithSupersession`) to close it.
/// - Part B: When TWO active contestations exist on the SAME target, resolving only the
///   first removes ONLY that contestation from the active index; execution on that target
///   remains `409 CONTESTATION_ACTIVE` citing the second contestation with 0 new effects
///   until the second contestation is also resolved.
#[tokio::test]
async fn c5_upheld_contestation_replay_and_second_active_contestation_keep_target_blocked() {
    let dir = TestTempDir::new("upheld-and-multi");
    let (state, app, dest_log) = setup_gateway(dir.path(), 0x54, vec![]).await;

    let receipt_trust = trust_store(RECEIPT_KEY_ID, &receipt_signer());
    let contester_trust = trust_store(CONTESTER_KEY_ID, &contester_signer());
    let corrector_trust = trust_store(CORRECTOR_KEY_ID, &corrector_signer());
    let resolver_trust = trust_store(RESOLVER_KEY_ID, &resolver_signer());
    let checkpoint_trust = trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer());

    // ===== PART A: ContestationUpheld + non-replay + later terminal resolution =====
    let target_a = target_hex(b"target-upheld");
    let (s_a, body_a) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_a.clone(),
            request_key: "c5-a-1".into(),
            claimed_created_at: NOW,
            action_input_hex: hex::encode(b"payload-a1"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_a, StatusCode::OK);
    let receipt_a = serde_json::from_value::<GovernedExecuteResponse>(body_a)
        .unwrap()
        .receipt;
    assert_eq!(count_external_effects(&dest_log), 1);

    let cont_a = sign_contestation("c5-a-cont", &receipt_a, "evidence invalid");
    assert_eq!(
        post_json(
            &app,
            "/v1/governed/contest",
            &ContestReceiptRequest {
                contestation: cont_a.clone(),
            },
        )
        .await
        .0,
        StatusCode::OK
    );

    // Uphold contestation (no correction yet).
    let res_upheld = sign_resolution(
        "c5-a-res-upheld",
        &receipt_a,
        &cont_a,
        None,
        ResolutionOutcome::ContestationUpheld,
        "contestation upheld; block must remain until remediated",
        RESOLVER_KEY_ID,
        &resolver_signer(),
    );
    let (s_up, body_up) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: res_upheld.clone(),
        },
    )
    .await;
    assert_eq!(s_up, StatusCode::OK, "upheld resolution failed: {body_up}");
    let up_resp: ResolveReceiptResponse = serde_json::from_value(body_up).unwrap();
    assert_eq!(up_resp.decision, "UPHELD");
    assert_eq!(up_resp.outcome, ResolutionOutcome::ContestationUpheld);

    // Offline verification of the upheld bundle (without correction).
    verify_offline_resolution_bundle(
        &receipt_a,
        &up_resp.original_receipt_proof,
        &cont_a,
        &up_resp.contestation_proof,
        None,
        &up_resp.resolution,
        &up_resp.resolution_proof,
        &up_resp.checkpoint,
        &receipt_trust,
        &contester_trust,
        &corrector_trust,
        &resolver_trust,
        &checkpoint_trust,
    )
    .expect("C6 offline verification of ContestationUpheld bundle must pass");

    // Replaying the EXACT same ContestationUpheld record must fail with 409 & zero MMR change!
    let (root_after_up, count_after_up) = state.mmr_root_and_count().unwrap();
    let (s_up_rep, v_up_rep) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: res_upheld,
        },
    )
    .await;
    assert_eq!(s_up_rep, StatusCode::CONFLICT, "expected 409: {v_up_rep}");
    assert_eq!(v_up_rep["error"], "RESOLUTION_ALREADY_RECORDED");
    assert_eq!(
        state.mmr_root_and_count().unwrap(),
        (root_after_up, count_after_up)
    );

    // Target A MUST still be blocked after ContestationUpheld.
    let (s_still_blk, body_still_blk) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_a.clone(),
            request_key: "c5-a-2".into(),
            claimed_created_at: NOW + 40,
            action_input_hex: hex::encode(b"payload-a2"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_still_blk, StatusCode::CONFLICT);
    assert_eq!(body_still_blk["decision"], "CONTESTATION_ACTIVE");
    assert_eq!(count_external_effects(&dest_log), 1);

    // Now admit a correction and a DISTINCT terminal resolution -> lifts block on target_A.
    let corr_a = sign_correction("c5-a-corr", &receipt_a, &cont_a, "remediated-a", "fixed");
    assert_eq!(
        post_json(
            &app,
            "/v1/governed/correct",
            &CorrectReceiptRequest {
                correction: corr_a.clone(),
            },
        )
        .await
        .0,
        StatusCode::OK
    );
    let res_close_a = sign_resolution(
        "c5-a-res-close",
        &receipt_a,
        &cont_a,
        Some(&corr_a),
        ResolutionOutcome::ResolvedWithSupersession,
        "remediation verified; closing previously upheld contestation",
        RESOLVER_KEY_ID,
        &resolver_signer(),
    );
    let (s_ca, _) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest {
            resolution: res_close_a,
        },
    )
    .await;
    assert_eq!(s_ca, StatusCode::OK);

    let (s_a_ok, _) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_a,
            request_key: "c5-a-3".into(),
            claimed_created_at: NOW + 50,
            action_input_hex: hex::encode(b"payload-a3"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_a_ok, StatusCode::OK);
    assert_eq!(count_external_effects(&dest_log), 2);

    // ===== PART B: Two simultaneous active contestations on the SAME target =====
    let target_b = target_hex(b"target-multi-contestation");
    let (s_b, body_b) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_b.clone(),
            request_key: "c5-b-1".into(),
            claimed_created_at: NOW + 60,
            action_input_hex: hex::encode(b"payload-b1"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_b, StatusCode::OK);
    let receipt_b = serde_json::from_value::<GovernedExecuteResponse>(body_b)
        .unwrap()
        .receipt;
    assert_eq!(count_external_effects(&dest_log), 3);

    // Admit TWO distinct contestations on receipt_b (same target_b).
    let cont_b1 = sign_contestation("c5-b-cont-1", &receipt_b, "first concern on target_b");
    let cont_b2 = sign_contestation("c5-b-cont-2", &receipt_b, "second independent concern");
    assert_eq!(
        post_json(
            &app,
            "/v1/governed/contest",
            &ContestReceiptRequest {
                contestation: cont_b1.clone(),
            },
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        post_json(
            &app,
            "/v1/governed/contest",
            &ContestReceiptRequest {
                contestation: cont_b2.clone(),
            },
        )
        .await
        .0,
        StatusCode::OK
    );

    // Resolve ONLY cont_b1 (`ContestationDismissed`).
    let res_b1 = sign_resolution(
        "c5-b-res-1",
        &receipt_b,
        &cont_b1,
        None,
        ResolutionOutcome::ContestationDismissed,
        "first concern dismissed",
        RESOLVER_KEY_ID,
        &resolver_signer(),
    );
    let (s_rb1, body_rb1) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest { resolution: res_b1 },
    )
    .await;
    assert_eq!(s_rb1, StatusCode::OK, "resolve cont_b1 failed: {body_rb1}");
    let rb1_resp: ResolveReceiptResponse = serde_json::from_value(body_rb1).unwrap();
    verify_offline_resolution_bundle(
        &receipt_b,
        &rb1_resp.original_receipt_proof,
        &cont_b1,
        &rb1_resp.contestation_proof,
        None,
        &rb1_resp.resolution,
        &rb1_resp.resolution_proof,
        &rb1_resp.checkpoint,
        &receipt_trust,
        &contester_trust,
        &corrector_trust,
        &resolver_trust,
        &checkpoint_trust,
    )
    .expect("offline verification of dismissed cont_b1 must pass");

    // Target B MUST STILL BE BLOCKED by cont_b2 with 0 additional effects!
    let (s_b_blk, body_b_blk) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_b.clone(),
            request_key: "c5-b-2".into(),
            claimed_created_at: NOW + 70,
            action_input_hex: hex::encode(b"payload-b2"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(
        s_b_blk,
        StatusCode::CONFLICT,
        "second active contestation on target_b must still block execution: {body_b_blk}"
    );
    assert_eq!(body_b_blk["decision"], "CONTESTATION_ACTIVE");
    assert_eq!(body_b_blk["contestation_digest"], cont_b2.leaf_digest_str());
    assert_eq!(count_external_effects(&dest_log), 3);

    // Now resolve cont_b2 as well (`ContestationDismissed`).
    let res_b2 = sign_resolution(
        "c5-b-res-2",
        &receipt_b,
        &cont_b2,
        None,
        ResolutionOutcome::ContestationDismissed,
        "second concern dismissed",
        RESOLVER_KEY_ID,
        &resolver_signer(),
    );
    let (s_rb2, body_rb2) = post_json(
        &app,
        "/v1/governed/resolve",
        &ResolveReceiptRequest { resolution: res_b2 },
    )
    .await;
    assert_eq!(s_rb2, StatusCode::OK, "resolve cont_b2 failed: {body_rb2}");
    let rb2_resp: ResolveReceiptResponse = serde_json::from_value(body_rb2).unwrap();
    verify_offline_resolution_bundle(
        &receipt_b,
        &rb2_resp.original_receipt_proof,
        &cont_b2,
        &rb2_resp.contestation_proof,
        None,
        &rb2_resp.resolution,
        &rb2_resp.resolution_proof,
        &rb2_resp.checkpoint,
        &receipt_trust,
        &contester_trust,
        &corrector_trust,
        &resolver_trust,
        &checkpoint_trust,
    )
    .expect("offline verification of dismissed cont_b2 must pass");

    // With ALL active contestations on target_b resolved, execution now succeeds!
    let (s_b_ok, body_b_ok) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_b,
            request_key: "c5-b-3".into(),
            claimed_created_at: NOW + 80,
            action_input_hex: hex::encode(b"payload-b3"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(
        s_b_ok,
        StatusCode::OK,
        "execution must resume once last active contestation on target_b is resolved: {body_b_ok}"
    );
    assert_eq!(body_b_ok["decision"], "ALLOWED");
    assert_eq!(count_external_effects(&dest_log), 4);
}
