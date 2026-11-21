//! Governed HTTP gateway endpoints for `arkhe-runtime`.
//!
//! Enforces that every mutable execution submitted over HTTP traverses
//! [`arkhe_kernel::governed_execution::execute_governed_with_review`]:
//! active policy loaded from [`SqliteActivationStore`], re-verified against the
//! trust store and clock, evaluated by `ContainmentGate`, routed to mandatory
//! review when declared by policy, and attested by a signed `ExecutionReceipt`
//! included in an append-only `rbb::mmr` with a signed `MmrCheckpoint`.
//!
//! HTTP status codes distinguish governance outcomes without ambiguity:
//! - `200 OK`: `ALLOWED` (executed with signed receipt + MMR proof + checkpoint)
//!   or `ACTIVATED` (policy bundle activated).
//! - `409 CONFLICT`: `REVIEW_REQUIRED` (permitted by policy but awaiting an
//!   exact, signed, single-use [`ReviewApproval`]; zero external effects) or
//!   `CONCURRENCY_CONFLICT` during activation.
//! - `403 FORBIDDEN`: `DENIED` / `REJECTED` (policy expired, invalid signature,
//!   disallowed intent, invalid/mismatched/consumed approval; zero external
//!   effects, with auditable `Rejected` receipt in MMR for execution attempts).
//! - `400 BAD_REQUEST` / `401 UNAUTHORIZED` / `422 UNPROCESSABLE_ENTITY` / `503 SERVICE_UNAVAILABLE`.

use arkhe_core::work::{RequestIdentity, WorkIntent, WorkIntentType};
use arkhe_core::{CanonicalEncode, Digest32};
use arkhe_governance::activation::ActivationError;
use arkhe_governance::policy_bundle::{SignaturePolicy, SignedPolicyBundle, TrustStore};
use arkhe_kernel::activation_sqlite::SqliteActivationStore;
use arkhe_kernel::governed_execution::{
    execute_governed_with_review, ExecutionReceipt, MmrCheckpoint, MmrLeafKind, MmrLog,
    ReceiptOutcome, ReviewApproval,
};
use arkhe_verify_core::rbb::mmr::Proof;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use ed25519_dalek::SigningKey;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

pub type EffectFn = dyn Fn(&WorkIntent, &[u8]) -> Result<Vec<u8>, String> + Send + Sync;
pub type ClockFn = dyn Fn() -> i64 + Send + Sync;

struct GovernedCore {
    store: SqliteActivationStore,
    mmr: MmrLog,
}

/// Counts of leaves currently recorded in the gateway's append-only MMR.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MmrCounts {
    pub activation_events: usize,
    pub executed_receipts: usize,
    pub review_required_receipts: usize,
    pub rejected_receipts: usize,
}

/// Shared state for the governed HTTP gateway.
pub struct GovernedGatewayState {
    core: Mutex<GovernedCore>,
    pub token: String,
    /// Server-authenticated actor identity (`requested_by`); never caller-supplied.
    pub actor: String,
    pub policy_trust: TrustStore,
    pub reviewer_trust: TrustStore,
    pub receipt_key_id: String,
    pub receipt_signer: SigningKey,
    pub checkpoint_key_id: String,
    pub checkpoint_signer: SigningKey,
    pub clock: Arc<ClockFn>,
    pub effect: Arc<EffectFn>,
}

impl GovernedGatewayState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        store: SqliteActivationStore,
        token: impl Into<String>,
        actor: impl Into<String>,
        policy_trust: TrustStore,
        reviewer_trust: TrustStore,
        receipt_key_id: impl Into<String>,
        receipt_signer: SigningKey,
        checkpoint_key_id: impl Into<String>,
        checkpoint_signer: SigningKey,
        clock: Arc<ClockFn>,
        effect: Arc<EffectFn>,
    ) -> Self {
        Self {
            core: Mutex::new(GovernedCore {
                store,
                mmr: MmrLog::new(),
            }),
            token: token.into(),
            actor: actor.into(),
            policy_trust,
            reviewer_trust,
            receipt_key_id: receipt_key_id.into(),
            receipt_signer,
            checkpoint_key_id: checkpoint_key_id.into(),
            checkpoint_signer,
            clock,
            effect,
        }
    }

    /// Snapshot counts of MMR leaves by kind (for audits and integration tests).
    pub fn mmr_counts(&self) -> MmrCounts {
        let core = self.core.lock().expect("governed core lock");
        MmrCounts {
            activation_events: core.mmr.count_kind(MmrLeafKind::ActivationEvent),
            executed_receipts: core.mmr.count_kind(MmrLeafKind::ExecutionReceiptExecuted),
            review_required_receipts: core
                .mmr
                .count_kind(MmrLeafKind::ExecutionReceiptReviewRequired),
            rejected_receipts: core.mmr.count_kind(MmrLeafKind::ExecutionReceiptRejected),
        }
    }
}

/// Build the Axum router for the governed policy activation and execution routes.
pub fn router(state: Arc<GovernedGatewayState>) -> Router {
    Router::new()
        .route("/v1/policies/activate", post(activate_policy))
        .route("/v1/governed/execute", post(governed_execute))
        .route("/v1/governed/checkpoint", get(governed_checkpoint))
        .with_state(state)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActivatePolicyRequest {
    pub bundle: SignedPolicyBundle,
    pub candidate_bytes_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GovernedExecuteRequest {
    pub policy_id: String,
    pub intent_type: WorkIntentType,
    /// 64 lowercase hex characters identifying the target object.
    pub target_hex: String,
    pub request_key: String,
    pub claimed_created_at: i64,
    pub action_input_hex: String,
    #[serde(default)]
    pub approval: Option<ReviewApproval>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GovernedExecuteResponse {
    pub decision: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action_digest: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub policy_digest: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activation_event_digest: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_hex: Option<String>,
    pub receipt: ExecutionReceipt,
    pub receipt_proof: Proof,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activation_leaf_hex: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activation_proof: Option<Proof>,
    pub checkpoint: MmrCheckpoint,
}

fn authenticate(
    headers: &HeaderMap,
    state: &GovernedGatewayState,
) -> Result<(), (StatusCode, Json<Value>)> {
    let expected = format!("Bearer {}", state.token);
    if headers.get("authorization").and_then(|v| v.to_str().ok()) != Some(expected.as_str()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "authentication required" })),
        ));
    }
    Ok(())
}

async fn activate_policy(
    State(state): State<Arc<GovernedGatewayState>>,
    headers: HeaderMap,
    Json(req): Json<ActivatePolicyRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;

    let candidate_bytes = hex::decode(&req.candidate_bytes_hex).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "candidate_bytes_hex must be valid hex" })),
        )
    })?;

    let now = (state.clock)();
    let mut core = state.core.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "governed store lock poisoned" })),
        )
    })?;

    match core.store.activate_bundle(
        &req.bundle,
        &candidate_bytes,
        &state.policy_trust,
        SignaturePolicy::Required,
        now,
    ) {
        Ok(activated) => {
            let core_ref = &mut *core;
            let store = &mut core_ref.store;
            let mmr = &mut core_ref.mmr;
            store
                .reconcile_outbox(|rec| mmr.project_outbox_record(rec).map(|_| ()))
                .map_err(|e| {
                    (
                        StatusCode::SERVICE_UNAVAILABLE,
                        Json(json!({ "decision": "STORAGE_ERROR", "reason": format!("{e:?}") })),
                    )
                })?;

            let event_digest = format!("blake3:{}", activated.event.object_digest().to_hex());
            Ok((
                StatusCode::OK,
                Json(json!({
                    "decision": "ACTIVATED",
                    "policy_id": activated.active.policy_id,
                    "version": activated.active.version,
                    "candidate_digest": activated.active.candidate_digest,
                    "event_digest": event_digest,
                })),
            ))
        }
        Err(ActivationError::ConcurrencyConflict { expected, actual }) => Err((
            StatusCode::CONFLICT,
            Json(json!({
                "decision": "CONCURRENCY_CONFLICT",
                "reason": format!("expected={expected:?}, actual={actual:?}"),
            })),
        )),
        Err(ActivationError::Storage(reason)) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "decision": "STORAGE_ERROR", "reason": reason })),
        )),
        Err(err) => Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "decision": "REJECTED",
                "reason": format!("{err:?}"),
            })),
        )),
    }
}

async fn governed_execute(
    State(state): State<Arc<GovernedGatewayState>>,
    headers: HeaderMap,
    Json(req): Json<GovernedExecuteRequest>,
) -> Result<(StatusCode, Json<GovernedExecuteResponse>), (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;

    let target_bytes: [u8; 32] = hex::decode(&req.target_hex)
        .ok()
        .and_then(|b| b.try_into().ok())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "target_hex must be 64 hex characters" })),
            )
        })?;
    let action_input = hex::decode(&req.action_input_hex).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "action_input_hex must be valid hex" })),
        )
    })?;

    let now = (state.clock)();
    let intent = WorkIntent {
        requested_by: state.actor.clone(),
        intent_type: req.intent_type,
        target: Digest32(target_bytes),
        parameters_digest: Digest32::blake3(b"AKG:HTTP:PARAMS:v1\0", &action_input),
        context: vec![],
        context_refs: vec![],
        request_identity: RequestIdentity::new(req.request_key.as_bytes()),
        claimed_created_at: req.claimed_created_at,
    };

    let mut core = state.core.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "governed store lock poisoned" })),
        )
    })?;

    let effect = Arc::clone(&state.effect);
    let core_ref = &mut *core;
    let outcome = execute_governed_with_review(
        &mut core_ref.store,
        &mut core_ref.mmr,
        &req.policy_id,
        &intent,
        &action_input,
        req.approval.as_ref(),
        &state.policy_trust,
        &state.reviewer_trust,
        &state.receipt_key_id,
        &state.receipt_signer,
        now,
        |i, data| (effect)(i, data),
    )
    .map_err(|reason| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "decision": "STORAGE_ERROR", "reason": reason })),
        )
    })?;

    let receipt_proof = core_ref
        .mmr
        .prove(outcome.receipt_leaf_index)
        .map_err(|e| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": format!("mmr prove receipt failed: {e}") })),
            )
        })?;

    let (activation_leaf_hex, activation_proof) = match outcome.activation_leaf_index {
        Some(idx) => {
            let leaf = core_ref
                .mmr
                .entries()
                .get(usize::try_from(idx).unwrap_or(usize::MAX))
                .map(|e| hex::encode(e.record));
            let proof = core_ref.mmr.prove(idx).ok();
            (leaf, proof)
        }
        None => (None, None),
    };

    let checkpoint = core_ref
        .mmr
        .sign_checkpoint(now, &state.checkpoint_key_id, &state.checkpoint_signer)
        .map_err(|e| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": format!("mmr checkpoint failed: {e}") })),
            )
        })?;

    let (status, decision, reason, action_digest, policy_digest, activation_event_digest) =
        match &outcome.receipt.outcome {
            ReceiptOutcome::Executed { .. } => (StatusCode::OK, "ALLOWED", None, None, None, None),
            ReceiptOutcome::ReviewRequired {
                action_digest,
                policy_digest,
                activation_event_digest,
                reason,
            } => (
                StatusCode::CONFLICT,
                "REVIEW_REQUIRED",
                Some(reason.clone()),
                Some(action_digest.clone()),
                Some(policy_digest.clone()),
                Some(activation_event_digest.clone()),
            ),
            ReceiptOutcome::Rejected { reason } => (
                StatusCode::FORBIDDEN,
                "DENIED",
                Some(reason.clone()),
                None,
                None,
                None,
            ),
        };

    let body = GovernedExecuteResponse {
        decision: decision.into(),
        reason,
        action_digest,
        policy_digest,
        activation_event_digest,
        output_hex: outcome.output.map(hex::encode),
        receipt: outcome.receipt,
        receipt_proof,
        activation_leaf_hex,
        activation_proof,
        checkpoint,
    };

    Ok((status, Json(body)))
}

async fn governed_checkpoint(
    State(state): State<Arc<GovernedGatewayState>>,
    headers: HeaderMap,
) -> Result<Json<MmrCheckpoint>, (StatusCode, Json<Value>)> {
    authenticate(&headers, &state)?;
    let now = (state.clock)();
    let core = state.core.lock().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "governed store lock poisoned" })),
        )
    })?;
    let cp = core
        .mmr
        .sign_checkpoint(now, &state.checkpoint_key_id, &state.checkpoint_signer)
        .map_err(|e| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": format!("no checkpoint available: {e}") })),
            )
        })?;
    Ok(Json(cp))
}
