#![cfg(feature = "sqlite-activation")]
//! HTTP gateway integration tests for `arkhe-runtime::governed_gateway`.
//!
//! Proves that client HTTP requests traverse `execute_governed_with_review()`
//! over `SqliteActivationStore` and `ContainmentGate` without bypass:
//! - Mandatory review blocks without approval (HTTP 409 `REVIEW_REQUIRED`, 0 effects).
//! - Exact signed approval bound to `(action_digest, policy_digest, activation_event_digest)`
//!   allows execution once (rejecting cross-action reuse and single-use replay).
//! - Allowed actions execute with signed receipts verifiable offline in `rbb::mmr`.
//! - Expired active policy and invalid activation signature both fail closed at the gateway.

use arkhe_core::work::WorkIntentType;
use arkhe_core::Digest32;
use arkhe_governance::activation::{candidate_digest, Proposal, TargetKind, PROPOSAL_SCHEMA};
use arkhe_governance::policy_bundle::{
    sign_policy_bundle, PolicyPayload, SignedPolicyBundle, TrustStore,
};
use arkhe_kernel::activation_sqlite::SqliteActivationStore;
use arkhe_kernel::governed_execution::{
    verify_offline_bundle, ActivePolicyDocument, ReceiptOutcome, ReviewApproval,
    ACTIVE_POLICY_SCHEMA, REVIEW_APPROVAL_SCHEMA,
};
use arkhe_runtime::governed_gateway::{
    router, ActivatePolicyRequest, GovernedExecuteRequest, GovernedExecuteResponse,
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

const TOKEN: &str = "governed-gateway-test-token";
const ACTOR: &str = "agent-client-alpha";
const POLICY_ID: &str = "arkhe-http-policy";
const AGENT_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const POLICY_KEY_ID: &str = "dev-founder-policy-key";
const REVIEWER_KEY_ID: &str = "dev-human-reviewer-key";
const RECEIPT_KEY_ID: &str = "dev-kernel-receipt-key";
const CHECKPOINT_KEY_ID: &str = "dev-mmr-checkpoint-key";
const ISSUED_AT: i64 = 1_795_132_800;
const EXPIRES_AT: i64 = 1_797_724_800;
const NOW: i64 = 1_795_270_000;
const BUSY_TIMEOUT_MS: u64 = 5_000;

struct TestTempDir {
    path: PathBuf,
}

impl TestTempDir {
    fn new(prefix: &str) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("arkhe-http-{prefix}-{}-{n}", std::process::id()));
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
    review_required_intents: Vec<WorkIntentType>,
    expires_at: i64,
) -> (SignedPolicyBundle, Vec<u8>) {
    let doc = ActivePolicyDocument {
        schema: ACTIVE_POLICY_SCHEMA.into(),
        allowed_intents,
        review_required_intents,
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

fn count_external_effects(dest_log: &Path) -> usize {
    match std::fs::read_to_string(dest_log) {
        Ok(content) => content.lines().filter(|l| !l.trim().is_empty()).count(),
        Err(_) => 0,
    }
}

fn build_gateway(
    dir: &Path,
    clock_now: Arc<AtomicI64>,
) -> (Arc<GovernedGatewayState>, axum::Router, PathBuf) {
    let db_path = dir.join("gateway_activation.sqlite");
    let dest_log = dir.join("external_effects.jsonl");
    let store = SqliteActivationStore::open(&db_path, BUSY_TIMEOUT_MS).unwrap();

    let dest_for_effect = dest_log.clone();
    let state = Arc::new(GovernedGatewayState::new(
        store,
        TOKEN,
        ACTOR,
        trust_store(POLICY_KEY_ID, &policy_signer()),
        trust_store(REVIEWER_KEY_ID, &reviewer_signer()),
        RECEIPT_KEY_ID,
        receipt_signer(),
        CHECKPOINT_KEY_ID,
        checkpoint_signer(),
        Arc::new(move || clock_now.load(Ordering::SeqCst)),
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
    ));
    let app = router(Arc::clone(&state));
    (state, app, dest_log)
}

async fn post_json(
    app: &axum::Router,
    uri: &str,
    auth: Option<&str>,
    body: &impl serde::Serialize,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json");
    if let Some(tok) = auth {
        builder = builder.header("authorization", format!("Bearer {tok}"));
    }
    let req = builder
        .body(Body::from(serde_json::to_vec(body).unwrap()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = to_bytes(resp.into_body(), 1_048_576).await.unwrap();
    let val: Value = serde_json::from_slice(&bytes).unwrap();
    (status, val)
}

fn target_hex() -> String {
    Digest32::blake3(b"HTTP:TARGET\0", b"governed-destination").to_hex()
}

fn verify_http_response_offline(resp: &GovernedExecuteResponse) {
    let receipt_trust = trust_store(RECEIPT_KEY_ID, &receipt_signer());
    let checkpoint_trust = trust_store(CHECKPOINT_KEY_ID, &checkpoint_signer());
    let activation_pair = match (&resp.activation_leaf_hex, &resp.activation_proof) {
        (Some(leaf_hex), Some(proof)) => {
            let bytes: [u8; 32] = hex::decode(leaf_hex).unwrap().try_into().unwrap();
            Some((bytes, proof))
        }
        _ => None,
    };
    verify_offline_bundle(
        &resp.receipt,
        &resp.receipt_proof,
        activation_pair,
        &resp.checkpoint,
        &receipt_trust,
        &checkpoint_trust,
    )
    .expect("offline verification of HTTP receipt + MMR proof + checkpoint must succeed");
}

#[tokio::test]
async fn http_review_required_blocks_without_approval() {
    let dir = TestTempDir::new("review-block");
    let clock = Arc::new(AtomicI64::new(NOW));
    let (state, app, dest_log) = build_gateway(dir.path(), Arc::clone(&clock));

    // 1. Activate a policy that allows DraftDocument ONLY with mandatory review.
    let (bundle, cand) = build_policy_bundle(
        1,
        0x01,
        None,
        vec![WorkIntentType::DraftDocument],
        vec![WorkIntentType::DraftDocument],
        EXPIRES_AT,
    );
    let (act_status, act_body) = post_json(
        &app,
        "/v1/policies/activate",
        Some(TOKEN),
        &ActivatePolicyRequest {
            bundle,
            candidate_bytes_hex: hex::encode(&cand),
        },
    )
    .await;
    assert_eq!(act_status, StatusCode::OK, "activation body={act_body}");
    assert_eq!(act_body["decision"], "ACTIVATED");

    // 2. Submit DraftDocument over the real HTTP route WITHOUT approval.
    let exec_req = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_hex(),
        request_key: "req-review-1".into(),
        claimed_created_at: NOW,
        action_input_hex: hex::encode(b"sensitive-draft-A"),
        context_refs_hex: vec![],
        approval: None,
    };
    let (status, body) = post_json(&app, "/v1/governed/execute", Some(TOKEN), &exec_req).await;

    // 3. Must return 409 REVIEW_REQUIRED (distinct from generic 403), 0 effects,
    //    0 executed receipts, and 1 verifiable ReviewRequired leaf in MMR.
    assert_eq!(status, StatusCode::CONFLICT, "body={body}");
    let resp: GovernedExecuteResponse = serde_json::from_value(body).unwrap();
    assert_eq!(resp.decision, "REVIEW_REQUIRED");
    assert!(resp.output_hex.is_none());
    assert!(resp.action_digest.is_some());
    assert!(resp.policy_digest.is_some());
    assert!(resp.activation_event_digest.is_some());
    assert!(matches!(
        resp.receipt.outcome,
        ReceiptOutcome::ReviewRequired { .. }
    ));

    assert_eq!(count_external_effects(&dest_log), 0);
    let counts = state.mmr_counts();
    assert_eq!(counts.activation_events, 1);
    assert_eq!(counts.executed_receipts, 0);
    assert_eq!(counts.review_required_receipts, 1);
    assert_eq!(counts.rejected_receipts, 0);

    verify_http_response_offline(&resp);
}

#[tokio::test]
async fn http_exact_approval_allows_once() {
    let dir = TestTempDir::new("exact-approval");
    let clock = Arc::new(AtomicI64::new(NOW));
    let (state, app, dest_log) = build_gateway(dir.path(), Arc::clone(&clock));

    // 1. Activate reviewable policy for DraftDocument.
    let (bundle, cand) = build_policy_bundle(
        1,
        0x02,
        None,
        vec![WorkIntentType::DraftDocument],
        vec![WorkIntentType::DraftDocument],
        EXPIRES_AT,
    );
    let (act_status, _) = post_json(
        &app,
        "/v1/policies/activate",
        Some(TOKEN),
        &ActivatePolicyRequest {
            bundle,
            candidate_bytes_hex: hex::encode(&cand),
        },
    )
    .await;
    assert_eq!(act_status, StatusCode::OK);

    // 2. Submit Action A without approval -> 409 REVIEW_REQUIRED with exact digests.
    let req_a_unapproved = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_hex(),
        request_key: "req-action-A".into(),
        claimed_created_at: NOW,
        action_input_hex: hex::encode(b"payload-A"),
        context_refs_hex: vec![],
        approval: None,
    };
    let (status_pending, val_pending) =
        post_json(&app, "/v1/governed/execute", Some(TOKEN), &req_a_unapproved).await;
    assert_eq!(status_pending, StatusCode::CONFLICT);
    let pending: GovernedExecuteResponse = serde_json::from_value(val_pending).unwrap();
    assert_eq!(pending.decision, "REVIEW_REQUIRED");
    assert_eq!(count_external_effects(&dest_log), 0);

    // 3. Reviewer signs an exact single-use approval bound to Action A + active policy + activation.
    let mut approval_a = ReviewApproval {
        schema: REVIEW_APPROVAL_SCHEMA.into(),
        approval_id: "aa".repeat(16),
        action_digest: pending.action_digest.clone().unwrap(),
        policy_digest: pending.policy_digest.clone().unwrap(),
        activation_event_digest: pending.activation_event_digest.clone().unwrap(),
        issued_at: NOW,
        expires_at: NOW + 3_600,
        reviewer_key_id: REVIEWER_KEY_ID.into(),
        signature_hex: String::new(),
    };
    approval_a.sign(&reviewer_signer());

    // Advance clock to simulate review latency (still within validity windows).
    clock.store(NOW + 60, Ordering::SeqCst);

    // 4. Negative check: reusing Action A's approval for Action B MUST be denied (0 effects).
    let req_b_with_a_approval = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_hex(),
        request_key: "req-action-B".into(),
        claimed_created_at: NOW,
        action_input_hex: hex::encode(b"payload-B-different"),
        context_refs_hex: vec![],
        approval: Some(approval_a.clone()),
    };
    let (status_b, val_b) = post_json(
        &app,
        "/v1/governed/execute",
        Some(TOKEN),
        &req_b_with_a_approval,
    )
    .await;
    assert_eq!(status_b, StatusCode::FORBIDDEN);
    assert_eq!(val_b["decision"], "DENIED");
    assert!(val_b["reason"]
        .as_str()
        .unwrap()
        .contains("action_digest mismatch"));
    assert_eq!(count_external_effects(&dest_log), 0);

    // 5. Positive check: submitting exact Action A with approval_a executes ONCE.
    let mut req_a_approved = req_a_unapproved.clone();
    req_a_approved.approval = Some(approval_a.clone());
    let (status_ok, val_ok) =
        post_json(&app, "/v1/governed/execute", Some(TOKEN), &req_a_approved).await;
    assert_eq!(status_ok, StatusCode::OK, "body={val_ok}");
    let ok_resp: GovernedExecuteResponse = serde_json::from_value(val_ok).unwrap();
    assert_eq!(ok_resp.decision, "ALLOWED");
    assert_eq!(
        ok_resp.output_hex.as_deref(),
        Some(hex::encode(b"EFFECT:payload-A").as_str())
    );
    match &ok_resp.receipt.outcome {
        ReceiptOutcome::Executed { approval_id, .. } => {
            assert_eq!(
                approval_id.as_deref(),
                Some(approval_a.approval_id.as_str())
            );
        }
        other => panic!("expected Executed receipt, got {other:?}"),
    }
    assert_eq!(count_external_effects(&dest_log), 1);
    verify_http_response_offline(&ok_resp);

    // 6. Single-use check: re-submitting Action A with the SAME approval_a MUST NOT execute twice.
    let (status_replay, val_replay) =
        post_json(&app, "/v1/governed/execute", Some(TOKEN), &req_a_approved).await;
    assert_eq!(status_replay, StatusCode::FORBIDDEN);
    assert_eq!(val_replay["decision"], "DENIED");
    assert!(val_replay["reason"]
        .as_str()
        .unwrap()
        .contains("already consumed"));
    assert_eq!(
        count_external_effects(&dest_log),
        1,
        "replayed approval must never trigger a second effect"
    );
    assert_eq!(state.mmr_counts().executed_receipts, 1);
}

#[tokio::test]
async fn http_allowed_action_executes_and_verifies() {
    let dir = TestTempDir::new("allowed");
    let clock = Arc::new(AtomicI64::new(NOW));
    let (state, app, dest_log) = build_gateway(dir.path(), Arc::clone(&clock));

    let (bundle, cand) = build_policy_bundle(
        1,
        0x03,
        None,
        vec![WorkIntentType::DraftDocument],
        vec![],
        EXPIRES_AT,
    );
    let (act_status, _) = post_json(
        &app,
        "/v1/policies/activate",
        Some(TOKEN),
        &ActivatePolicyRequest {
            bundle,
            candidate_bytes_hex: hex::encode(&cand),
        },
    )
    .await;
    assert_eq!(act_status, StatusCode::OK);

    let req = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_hex(),
        request_key: "req-direct-1".into(),
        claimed_created_at: NOW,
        action_input_hex: hex::encode(b"direct-allowed-doc"),
        context_refs_hex: vec![],
        approval: None,
    };

    // Unauthenticated request is refused before touching the kernel.
    let (unauth_status, _) = post_json(&app, "/v1/governed/execute", None, &req).await;
    assert_eq!(unauth_status, StatusCode::UNAUTHORIZED);
    assert_eq!(count_external_effects(&dest_log), 0);

    // Authenticated request traverses execute_governed(), writes 1 effect, and verifies offline.
    let (status, val) = post_json(&app, "/v1/governed/execute", Some(TOKEN), &req).await;
    assert_eq!(status, StatusCode::OK, "body={val}");
    let resp: GovernedExecuteResponse = serde_json::from_value(val).unwrap();
    assert_eq!(resp.decision, "ALLOWED");
    assert_eq!(count_external_effects(&dest_log), 1);
    assert_eq!(state.mmr_counts().activation_events, 1);
    assert_eq!(state.mmr_counts().executed_receipts, 1);

    verify_http_response_offline(&resp);
}

#[tokio::test]
async fn http_expired_policy_blocks_at_gateway() {
    let dir = TestTempDir::new("expired-http");
    let clock = Arc::new(AtomicI64::new(NOW));
    let (state, app, dest_log) = build_gateway(dir.path(), Arc::clone(&clock));

    // 1. Activate while valid at t = NOW.
    let (bundle, cand) = build_policy_bundle(
        1,
        0x04,
        None,
        vec![WorkIntentType::DraftDocument],
        vec![],
        EXPIRES_AT,
    );
    let (act_status, _) = post_json(
        &app,
        "/v1/policies/activate",
        Some(TOKEN),
        &ActivatePolicyRequest {
            bundle,
            candidate_bytes_hex: hex::encode(&cand),
        },
    )
    .await;
    assert_eq!(act_status, StatusCode::OK);

    // 2. Advance gateway clock to exclusive expiry boundary (`t == EXPIRES_AT`).
    clock.store(EXPIRES_AT, Ordering::SeqCst);

    let req = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::DraftDocument,
        target_hex: target_hex(),
        request_key: "req-expired-http".into(),
        claimed_created_at: EXPIRES_AT,
        action_input_hex: hex::encode(b"after-expiry"),
        context_refs_hex: vec![],
        approval: None,
    };
    let (status, val) = post_json(&app, "/v1/governed/execute", Some(TOKEN), &req).await;

    assert_eq!(status, StatusCode::FORBIDDEN, "body={val}");
    let resp: GovernedExecuteResponse = serde_json::from_value(val).unwrap();
    assert_eq!(resp.decision, "DENIED");
    assert!(resp.reason.as_deref().unwrap().contains("Expired"));
    assert!(resp.output_hex.is_none());
    assert_eq!(count_external_effects(&dest_log), 0);

    let counts = state.mmr_counts();
    assert_eq!(counts.activation_events, 1);
    assert_eq!(counts.executed_receipts, 0);
    assert_eq!(counts.rejected_receipts, 1);

    verify_http_response_offline(&resp);
}

#[tokio::test]
async fn http_invalid_signature_blocks_at_gateway() {
    let dir = TestTempDir::new("invalid-sig-http");
    let clock = Arc::new(AtomicI64::new(NOW));
    let (state, app, dest_log) = build_gateway(dir.path(), Arc::clone(&clock));

    // 1. Activate valid policy v1 allowing only DraftDocument.
    let (bundle_v1, cand_v1) = build_policy_bundle(
        1,
        0x05,
        None,
        vec![WorkIntentType::DraftDocument],
        vec![],
        EXPIRES_AT,
    );
    let (s1, v1_body) = post_json(
        &app,
        "/v1/policies/activate",
        Some(TOKEN),
        &ActivatePolicyRequest {
            bundle: bundle_v1,
            candidate_bytes_hex: hex::encode(&cand_v1),
        },
    )
    .await;
    assert_eq!(s1, StatusCode::OK);
    let v1_digest = v1_body["candidate_digest"].as_str().unwrap().to_string();

    // 2. Submit policy v2 (which would allow Simulate) with a corrupted signature.
    let (mut bad_v2, cand_v2) = build_policy_bundle(
        2,
        0x06,
        Some(&v1_digest),
        vec![WorkIntentType::DraftDocument, WorkIntentType::Simulate],
        vec![],
        EXPIRES_AT,
    );
    let mut sig = bad_v2.signature.expect("signed");
    sig[0] ^= 0xFF;
    bad_v2.signature = Some(sig);

    let (s2, v2_body) = post_json(
        &app,
        "/v1/policies/activate",
        Some(TOKEN),
        &ActivatePolicyRequest {
            bundle: bad_v2,
            candidate_bytes_hex: hex::encode(&cand_v2),
        },
    )
    .await;
    assert_eq!(s2, StatusCode::FORBIDDEN, "body={v2_body}");
    assert_eq!(v2_body["decision"], "REJECTED");
    assert!(v2_body["reason"]
        .as_str()
        .unwrap()
        .contains("InvalidSignature"));

    // 3. Attempting Simulate over HTTP is denied under intact v1 with 0 external effects.
    let sim_req = GovernedExecuteRequest {
        policy_id: POLICY_ID.into(),
        intent_type: WorkIntentType::Simulate,
        target_hex: target_hex(),
        request_key: "req-sim-blocked".into(),
        claimed_created_at: NOW,
        action_input_hex: hex::encode(b"sim-under-bad-v2"),
        context_refs_hex: vec![],
        approval: None,
    };
    let (s3, val3) = post_json(&app, "/v1/governed/execute", Some(TOKEN), &sim_req).await;
    assert_eq!(s3, StatusCode::FORBIDDEN);
    let resp3: GovernedExecuteResponse = serde_json::from_value(val3).unwrap();
    assert_eq!(resp3.decision, "DENIED");
    assert_eq!(resp3.receipt.policy_version, Some(1));
    assert_eq!(count_external_effects(&dest_log), 0);
    assert_eq!(state.mmr_counts().activation_events, 1);
    assert_eq!(state.mmr_counts().executed_receipts, 0);
    assert_eq!(state.mmr_counts().rejected_receipts, 1);

    verify_http_response_offline(&resp3);
}
