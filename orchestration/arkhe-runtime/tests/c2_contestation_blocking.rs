#![cfg(feature = "sqlite-activation")]
//! C2 — Active contestation blocks dependent execution/claims without blocking
//! independent actions, without consuming single-use approvals, and without
//! mutating original evidence.
//!
//! Enforces BOTH causal dependency vectors:
//! 1. Authenticated causal dependency carried in `WorkIntent::context_refs`
//!    (`context_refs_hex`), hashed into `intent_digest` and `action_digest`.
//! 2. Trusted server-side target-scope state (`intent.target`), so a client
//!    cannot bypass an active contestation simply by omitting `context_refs_hex`.

use arkhe_core::work::{RequestIdentity, WorkIntent, WorkIntentType};
use arkhe_core::Digest32;
use arkhe_governance::activation::{candidate_digest, Proposal, TargetKind, PROPOSAL_SCHEMA};
use arkhe_governance::policy_bundle::{
    sign_policy_bundle, PolicyPayload, SignedPolicyBundle, TrustStore,
};
use arkhe_kernel::activation_sqlite::SqliteActivationStore;
use arkhe_kernel::governed_execution::{
    compute_action_digest, verify_offline_contestation_block_bundle, ActivePolicyDocument,
    ContestationRecord, ExecutionReceipt, ReceiptOutcome, ReviewApproval, ACTIVE_POLICY_SCHEMA,
    CONTESTATION_RECORD_SCHEMA, REVIEW_APPROVAL_SCHEMA,
};
use arkhe_runtime::governed_gateway::{
    router, ActivatePolicyRequest, ContestReceiptRequest, ContestReceiptResponse,
    GovernedExecuteRequest, GovernedExecuteResponse, GovernedGatewayState,
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

const TOKEN: &str = "c2-contestation-blocking-token";
const ACTOR: &str = "agent-c2-client";
const POLICY_ID: &str = "arkhe-c2-policy";
const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const POLICY_KEY_ID: &str = "dev-founder-policy-key";
const REVIEWER_KEY_ID: &str = "dev-human-reviewer-key";
const CONTESTER_KEY_ID: &str = "dev-auditor-contester-key";
const RECEIPT_KEY_ID: &str = "dev-kernel-receipt-key";
const CHECKPOINT_KEY_ID: &str = "dev-mmr-checkpoint-key";
const ISSUED_AT: i64 = 1_795_132_800;
const EXPIRES_AT: i64 = 1_797_724_800;
const NOW: i64 = 1_795_290_000;
const BUSY_TIMEOUT_MS: u64 = 5_000;

struct TestTempDir {
    path: PathBuf,
}

impl TestTempDir {
    fn new(prefix: &str) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("arkhe-c2-{prefix}-{}-{n}", std::process::id()));
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

fn target_hex(label: &[u8]) -> String {
    Digest32::blake3(b"C2:TARGET\0", label).to_hex()
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
    let db_path = dir.join("c2_activation.sqlite");
    let dest_log = dir.join("c2_external_effects.jsonl");
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
        .with_contester_trust(trust_store(CONTESTER_KEY_ID, &contester_signer())),
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

fn signed_contestation(
    contestation_id: &str,
    original_receipt: &ExecutionReceipt,
) -> ContestationRecord {
    let mut rec = ContestationRecord {
        schema: CONTESTATION_RECORD_SCHEMA.into(),
        contestation_id: contestation_id.into(),
        receipt_digest: original_receipt.leaf_digest_str(),
        policy_digest: original_receipt.active_candidate_digest.clone().unwrap(),
        activation_event_digest: original_receipt.activation_event_digest.clone().unwrap(),
        reason: "material dispute blocking dependent execution".into(),
        contested_at: NOW + 15,
        contester_key_id: CONTESTER_KEY_ID.into(),
        signature_hex: String::new(),
    };
    rec.sign(&contester_signer());
    rec
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

#[tokio::test]
async fn c2_active_contestation_blocks_dependent_execution_and_records_refusal() {
    let dir = TestTempDir::new("block-dep");
    let (state, app, dest_log) = setup_gateway(dir.path(), 0x11, vec![]).await;

    // 1. Execute Action A on target_A -> 200 ALLOWED, external_effect_count == 1.
    let target_a = target_hex(b"resource-A");
    let req_a = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_a.clone(),
        request_key: "c2-action-A".into(),
        claimed_created_at: NOW,
        action_input_hex: hex::encode(b"payload-A"),
        context_refs_hex: vec![],
        approval: None,
    };
    let (s_a, val_a) = post_json(&app, "/v1/governed/execute", &req_a).await;
    assert_eq!(s_a, StatusCode::OK, "body={val_a}");
    let resp_a: GovernedExecuteResponse = serde_json::from_value(val_a).unwrap();
    assert_eq!(resp_a.decision, "ALLOWED");
    assert_eq!(count_external_effects(&dest_log), 1);

    // 2. Admit active ContestationRecord on receipt_A -> 200 CONTESTED.
    let contestation = signed_contestation(&"a1".repeat(16), &resp_a.receipt);
    let active_contestation_digest = contestation.leaf_digest_str();
    let (s_c, val_c) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest {
            contestation: contestation.clone(),
        },
    )
    .await;
    assert_eq!(s_c, StatusCode::OK, "body={val_c}");
    let resp_c: ContestReceiptResponse = serde_json::from_value(val_c).unwrap();
    assert_eq!(resp_c.decision, "CONTESTED");

    // Capture snapshots BEFORE dependent attempt.
    let effects_before = count_external_effects(&dest_log);
    let (orig_pos_before, orig_bytes_before) = state
        .receipt_snapshot(&resp_a.receipt.leaf_hash())
        .expect("receipt_A stored");
    let (cont_pos_before, cont_bytes_before) = state
        .contestation_snapshot(&contestation.leaf_hash())
        .expect("contestation stored");

    // 3a. Submit dependent execution explicitly citing receipt_A in context_refs_hex.
    let req_dep_explicit = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_hex(b"downstream-resource-X"),
        request_key: "c2-dep-explicit".into(),
        claimed_created_at: NOW + 20,
        action_input_hex: hex::encode(b"dependent-claim-on-A"),
        context_refs_hex: vec![resp_a.receipt.leaf_digest_str()],
        approval: None,
    };
    let (s_dep, val_dep) = post_json(&app, "/v1/governed/execute", &req_dep_explicit).await;
    assert_eq!(s_dep, StatusCode::CONFLICT, "body={val_dep}");
    let resp_dep: GovernedExecuteResponse = serde_json::from_value(val_dep).unwrap();
    assert_eq!(resp_dep.decision, "CONTESTATION_ACTIVE");
    assert!(resp_dep.output_hex.is_none());
    assert_eq!(
        resp_dep.contestation_digest.as_deref(),
        Some(active_contestation_digest.as_str())
    );
    assert_eq!(
        resp_dep.contested_receipt_digest.as_deref(),
        Some(resp_a.receipt.leaf_digest_str().as_str())
    );
    assert!(matches!(
        resp_dep.receipt.outcome,
        ReceiptOutcome::ContestedBlocked { .. }
    ));
    assert_eq!(count_external_effects(&dest_log), effects_before);

    // 3b. Client omission bypass check: submit on the SAME target_A while OMITTING
    //     context_refs_hex -> trusted target-scope state STILL blocks before effect!
    let req_dep_omitted = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_a,
        request_key: "c2-dep-omitted-ref".into(),
        claimed_created_at: NOW + 25,
        action_input_hex: hex::encode(b"try-bypass-same-target"),
        context_refs_hex: vec![],
        approval: None,
    };
    let (s_omit, val_omit) = post_json(&app, "/v1/governed/execute", &req_dep_omitted).await;
    assert_eq!(s_omit, StatusCode::CONFLICT, "body={val_omit}");
    let resp_omit: GovernedExecuteResponse = serde_json::from_value(val_omit).unwrap();
    assert_eq!(resp_omit.decision, "CONTESTATION_ACTIVE");
    assert_eq!(
        resp_omit.contestation_digest.as_deref(),
        Some(active_contestation_digest.as_str())
    );
    assert_eq!(count_external_effects(&dest_log), effects_before);

    // 4. Verify original receipt AND contestation bytes/positions remain untouched.
    let (orig_pos_after, orig_bytes_after) =
        state.receipt_snapshot(&resp_a.receipt.leaf_hash()).unwrap();
    let (cont_pos_after, cont_bytes_after) = state
        .contestation_snapshot(&contestation.leaf_hash())
        .unwrap();
    assert_eq!(orig_pos_after, orig_pos_before);
    assert_eq!(orig_bytes_after, orig_bytes_before);
    assert_eq!(cont_pos_after, cont_pos_before);
    assert_eq!(cont_bytes_after, cont_bytes_before);

    // 5. Offline verification of original receipt + contestation + refusal receipt
    //    against the SAME posterior checkpoint.
    let orig_proof_post = state.prove_leaf(orig_pos_after).unwrap();
    let cont_proof_post = state.prove_leaf(cont_pos_after).unwrap();
    verify_offline_contestation_block_bundle(
        &resp_a.receipt,
        &orig_proof_post,
        &contestation,
        &cont_proof_post,
        &resp_omit.receipt,
        &resp_omit.receipt_proof,
        &resp_omit.checkpoint,
        &trust_store(RECEIPT_KEY_ID, &receipt_signer()),
        &trust_store(CONTESTER_KEY_ID, &contester_signer()),
        &trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer()),
    )
    .expect("offline verification of original receipt + contestation + refusal must pass");
}

#[tokio::test]
async fn c2_contestation_does_not_block_unrelated_independent_execution() {
    let dir = TestTempDir::new("scope-iso");
    let (_state, app, dest_log) = setup_gateway(dir.path(), 0x22, vec![]).await;

    // 1. Execute Action A on target_A and contest receipt_A.
    let target_a = target_hex(b"scope-resource-A");
    let (s_a, val_a) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_a.clone(),
            request_key: "scope-A".into(),
            claimed_created_at: NOW,
            action_input_hex: hex::encode(b"doc-A"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_a, StatusCode::OK);
    let resp_a: GovernedExecuteResponse = serde_json::from_value(val_a).unwrap();
    assert_eq!(count_external_effects(&dest_log), 1);

    let contestation = signed_contestation(&"b2".repeat(16), &resp_a.receipt);
    let (s_c, _) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest { contestation },
    )
    .await;
    assert_eq!(s_c, StatusCode::OK);

    // 2. Independent Action B on unrelated target_B MUST execute normally (200 ALLOWED).
    let effects_before_ind = count_external_effects(&dest_log);
    let (s_b, val_b) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_hex(b"unrelated-resource-B"),
            request_key: "scope-B-independent".into(),
            claimed_created_at: NOW + 10,
            action_input_hex: hex::encode(b"doc-B-independent"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_b, StatusCode::OK, "body={val_b}");
    let resp_b: GovernedExecuteResponse = serde_json::from_value(val_b).unwrap();
    assert_eq!(resp_b.decision, "ALLOWED");
    let effects_after_ind = count_external_effects(&dest_log);
    assert_eq!(effects_after_ind, effects_before_ind + 1);

    // 3. Dependent Action C referencing receipt_A MUST still be blocked (0 new effects).
    let (s_dep, val_dep) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_hex(b"downstream-C"),
            request_key: "scope-C-dependent".into(),
            claimed_created_at: NOW + 20,
            action_input_hex: hex::encode(b"doc-C-depends-on-A"),
            context_refs_hex: vec![resp_a.receipt.leaf_digest_str()],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_dep, StatusCode::CONFLICT, "body={val_dep}");
    assert_eq!(val_dep["decision"], "CONTESTATION_ACTIVE");
    assert_eq!(count_external_effects(&dest_log), effects_after_ind);
}

#[tokio::test]
async fn c2_replaying_blocked_claim_never_leaks_external_effect() {
    let dir = TestTempDir::new("approval-order");
    // Policy requires mandatory review for DraftDocument so we can prove C2.0:
    // active contestation blocks BEFORE consuming a valid single-use ReviewApproval.
    let (state, app, dest_log) =
        setup_gateway(dir.path(), 0x33, vec![WorkIntentType::DraftDocument]).await;

    let target_a = target_hex(b"reviewed-resource-A");

    // 1. Trigger 409 REVIEW_REQUIRED for Action A to obtain active policy & activation digests.
    let mut req_a = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_a.clone(),
        request_key: "reviewed-A-1".into(),
        claimed_created_at: NOW,
        action_input_hex: hex::encode(b"reviewed-payload-A"),
        context_refs_hex: vec![],
        approval: None,
    };
    let (s_pend, val_pend) = post_json(&app, "/v1/governed/execute", &req_a).await;
    assert_eq!(s_pend, StatusCode::CONFLICT);
    let pend: GovernedExecuteResponse = serde_json::from_value(val_pend).unwrap();
    assert_eq!(pend.decision, "REVIEW_REQUIRED");
    let policy_digest = pend.policy_digest.clone().unwrap();
    let activation_digest = pend.activation_event_digest.clone().unwrap();

    // 2. Approve Action A and execute it once -> 200 ALLOWED, 1 external effect.
    let appr_1 = sign_exact_approval(&"11".repeat(16), &req_a, &policy_digest, &activation_digest);
    req_a.approval = Some(appr_1.clone());
    let (s_ok, val_ok) = post_json(&app, "/v1/governed/execute", &req_a).await;
    assert_eq!(s_ok, StatusCode::OK, "body={val_ok}");
    let resp_a: GovernedExecuteResponse = serde_json::from_value(val_ok).unwrap();
    assert_eq!(count_external_effects(&dest_log), 1);
    assert!(state
        .is_review_approval_consumed(&appr_1.approval_id)
        .unwrap());

    // 3. Contest receipt_A -> 200 CONTESTED.
    let contestation = signed_contestation(&"c3".repeat(16), &resp_a.receipt);
    let (s_c, _) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest { contestation },
    )
    .await;
    assert_eq!(s_c, StatusCode::OK);

    // 4. Construct a NEW dependent claim carrying a VALID, signed, unconsumed approval_2.
    let mut req_blocked = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_a,
        request_key: "reviewed-A-2-dependent".into(),
        claimed_created_at: NOW + 30,
        action_input_hex: hex::encode(b"dependent-claim-with-valid-approval"),
        context_refs_hex: vec![resp_a.receipt.leaf_digest_str()],
        approval: None,
    };
    let appr_2 = sign_exact_approval(
        &"22".repeat(16),
        &req_blocked,
        &policy_digest,
        &activation_digest,
    );
    req_blocked.approval = Some(appr_2.clone());

    // 5. First submission -> BLOCKED by active contestation; approval_2 MUST NOT be consumed!
    let (s_b1, val_b1) = post_json(&app, "/v1/governed/execute", &req_blocked).await;
    assert_eq!(s_b1, StatusCode::CONFLICT, "body={val_b1}");
    assert_eq!(val_b1["decision"], "CONTESTATION_ACTIVE");
    assert_eq!(count_external_effects(&dest_log), 1);
    assert!(
        !state
            .is_review_approval_consumed(&appr_2.approval_id)
            .unwrap(),
        "C2.0 violated: single-use approval must remain unconsumed when blocked by active contestation"
    );

    // 6. Replay the exact same blocked claim -> still 0 additional effects, approval_2 still available,
    //    append-only MMR trail stays consistent.
    let (s_b2, val_b2) = post_json(&app, "/v1/governed/execute", &req_blocked).await;
    assert_eq!(s_b2, StatusCode::CONFLICT, "body={val_b2}");
    assert_eq!(val_b2["decision"], "CONTESTATION_ACTIVE");
    assert_eq!(count_external_effects(&dest_log), 1);
    assert!(
        !state
            .is_review_approval_consumed(&appr_2.approval_id)
            .unwrap(),
        "replayed blocked claim must not consume approval"
    );
    let counts = state.mmr_counts();
    assert_eq!(counts.executed_receipts, 1);
    assert_eq!(counts.contestation_records, 1);
    assert!(counts.contested_blocked_receipts >= 1);
}

#[tokio::test]
async fn c2_contestation_does_not_mutate_original_evidence() {
    let dir = TestTempDir::new("preserve-ev");
    let (state, app, dest_log) = setup_gateway(dir.path(), 0x44, vec![]).await;

    let target_a = target_hex(b"immutable-A");
    let (s_a, val_a) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_a.clone(),
            request_key: "imm-A".into(),
            claimed_created_at: NOW,
            action_input_hex: hex::encode(b"immutable-payload-A"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_a, StatusCode::OK);
    let resp_a: GovernedExecuteResponse = serde_json::from_value(val_a).unwrap();

    let contestation = signed_contestation(&"d4".repeat(16), &resp_a.receipt);
    let (s_c, _) = post_json(
        &app,
        "/v1/governed/contest",
        &ContestReceiptRequest {
            contestation: contestation.clone(),
        },
    )
    .await;
    assert_eq!(s_c, StatusCode::OK);

    // Snapshot original receipt and contestation bytes, digests, and leaf indices.
    let (r_pos_before, r_bytes_before) =
        state.receipt_snapshot(&resp_a.receipt.leaf_hash()).unwrap();
    let (c_pos_before, c_bytes_before) = state
        .contestation_snapshot(&contestation.leaf_hash())
        .unwrap();
    let r_digest_before = resp_a.receipt.leaf_digest_str();
    let c_digest_before = contestation.leaf_digest_str();

    // Perform an unrelated execution + two blocked dependent executions.
    let (s_ind, _) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_hex(b"other-target-Z"),
            request_key: "imm-ind".into(),
            claimed_created_at: NOW + 5,
            action_input_hex: hex::encode(b"independent-Z"),
            context_refs_hex: vec![],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_ind, StatusCode::OK);
    assert_eq!(count_external_effects(&dest_log), 2);

    let (s_blk, val_blk) = post_json(
        &app,
        "/v1/governed/execute",
        &GovernedExecuteRequest {
            policy_id: POLICY_ID.into(),
            intent_type: WorkIntentType::DraftDocument,
            target_hex: target_a,
            request_key: "imm-blocked".into(),
            claimed_created_at: NOW + 10,
            action_input_hex: hex::encode(b"blocked-on-A"),
            context_refs_hex: vec![resp_a.receipt.leaf_digest_str()],
            approval: None,
        },
    )
    .await;
    assert_eq!(s_blk, StatusCode::CONFLICT);
    let resp_blk: GovernedExecuteResponse = serde_json::from_value(val_blk).unwrap();
    assert_eq!(count_external_effects(&dest_log), 2);

    // Confirm bit-for-bit preservation of original receipt and contestation.
    let (r_pos_after, r_bytes_after) = state.receipt_snapshot(&resp_a.receipt.leaf_hash()).unwrap();
    let (c_pos_after, c_bytes_after) = state
        .contestation_snapshot(&contestation.leaf_hash())
        .unwrap();
    assert_eq!(r_pos_after, r_pos_before);
    assert_eq!(r_bytes_after, r_bytes_before);
    assert_eq!(resp_a.receipt.leaf_digest_str(), r_digest_before);
    assert_eq!(c_pos_after, c_pos_before);
    assert_eq!(c_bytes_after, c_bytes_before);
    assert_eq!(contestation.leaf_digest_str(), c_digest_before);

    // Verify all three records offline against the final posterior checkpoint.
    let r_proof = state.prove_leaf(r_pos_after).unwrap();
    let c_proof = state.prove_leaf(c_pos_after).unwrap();
    verify_offline_contestation_block_bundle(
        &resp_a.receipt,
        &r_proof,
        &contestation,
        &c_proof,
        &resp_blk.receipt,
        &resp_blk.receipt_proof,
        &resp_blk.checkpoint,
        &trust_store(RECEIPT_KEY_ID, &receipt_signer()),
        &trust_store(CONTESTER_KEY_ID, &contester_signer()),
        &trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer()),
    )
    .expect("offline verification of all three records against final checkpoint must pass");
}
