//! `POST /v1/tasks` — a finished agent run proposes a transition.
//!
//! What this is not: `/v1/runs` admits a `WorkerExecutionRecord` saying that a
//! run happened, with `output_digest: ZERO` and no evidence refs. It proves a
//! bearer of the token said so. This endpoint runs the invariant the task names
//! over what the run actually produced, and answers with an authorization or an
//! exclusion carrying its reason. The invariant decides; the endpoint carries.
//!
//! `requested_by` is the authenticated actor and is never a body field. A bearer
//! of the token cannot propose work as someone else, and `deny_unknown_fields`
//! means trying to send it is a 422 rather than a silent override.
//!
//! Status codes, because the distinction is the product:
//!
//! - `200` ADMITTED. The invariant held and the kernel authorized.
//! - `403` EXCLUDED. Well-formed, understood, and refused — a failed invariant,
//!   an invariant this process does not have, or a kernel rejection. The body
//!   is the reason.
//! - `400` the request names something unusable (a target that is not a digest,
//!   an output that is not hex, an identifier out of range).
//! - `401` no token or the wrong one. `422` malformed or unknown fields.
//! - `503` evidence could not be committed. Not a verdict about the run.

use arkhe_core::{
    evidence::{EvidenceCommitter, EvidenceReader},
    work::WorkIntentType,
    Digest32,
};
use arkhe_exec_adapter::{admit, Exclusion, InvariantProfile, Registry, RunReport, TaskSpec};
use arkhe_kernel::{AuthorizationDecision, ContainmentGate};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

pub struct TaskEndpoint<S> {
    pub store: Arc<S>,
    pub token: String,
    /// The `requested_by` of every proposal. Not caller-supplied.
    pub actor: String,
    /// The invariants this process can run. An id outside it is excluded.
    pub registry: Registry,
    /// Which invariant module may stand as the analysis for which task class.
    /// Nothing is allowed by default.
    pub profile: InvariantProfile,
}

/// Same bearer token as the other runtime routes.
pub fn router<S>(endpoint: Arc<TaskEndpoint<S>>) -> Router
where
    S: EvidenceCommitter + EvidenceReader + Send + Sync + 'static,
{
    Router::new()
        .route("/v1/tasks", post(propose))
        .with_state(endpoint)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskRunReport {
    pub intent_type: WorkIntentType,
    /// 64 lowercase hex: what is acted on.
    pub target: String,
    pub invariant_id: String,
    /// One key per logical request. Retries of the same request reuse it, and
    /// reach the same operation.
    pub request_key: String,
    pub claimed_created_at: i64,
    /// The executing module: a skill or computer-use harness identifier.
    pub module_id: String,
    pub module_version: String,
    /// Unique per run; retries of the same run must reuse it.
    pub execution_id: String,
    /// Hex of the artifact the run produced.
    pub output: String,
}

fn digest(value: &str) -> Option<Digest32> {
    let bytes: [u8; 32] = hex::decode(value).ok()?.try_into().ok()?;
    Some(Digest32(bytes))
}

async fn propose<S>(
    State(e): State<Arc<TaskEndpoint<S>>>,
    headers: HeaderMap,
    Json(report): Json<TaskRunReport>,
) -> Result<Json<Value>, (StatusCode, String)>
where
    S: EvidenceCommitter + EvidenceReader + Send + Sync + 'static,
{
    let expected = format!("Bearer {}", e.token);
    if headers.get("authorization").and_then(|v| v.to_str().ok()) != Some(&expected) {
        return Err((StatusCode::UNAUTHORIZED, "authentication required".into()));
    }

    let bad = |message: &str| (StatusCode::BAD_REQUEST, message.to_owned());
    let target = digest(&report.target).ok_or_else(|| bad("target is not a 32-byte digest"))?;
    let output = hex::decode(&report.output).map_err(|_| bad("output is not hex"))?;

    let spec = TaskSpec {
        requested_by: e.actor.clone(),
        intent_type: report.intent_type.clone(),
        target,
        invariant_id: report.invariant_id.clone(),
        request_key: report.request_key.clone().into_bytes(),
        claimed_created_at: report.claimed_created_at,
    };
    let run = RunReport {
        module_id: report.module_id.clone(),
        module_version: report.module_version.clone(),
        execution_id: report.execution_id.clone(),
        output,
    };

    let admission = match admit(&spec, &run, &e.registry, e.store.as_ref()).await {
        Ok(admission) => admission,
        Err(Exclusion::Malformed(field)) => {
            return Err(bad(&format!("malformed run: {field}")));
        }
        // The store failed. That is infrastructure, not a verdict about the run,
        // and the inner reason stays out of the response.
        Err(Exclusion::CommitFailed(_)) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                "evidence commit failed".into(),
            ));
        }
        Err(excluded) => return Err((StatusCode::FORBIDDEN, excluded.reason())),
    };

    let binding = e.profile.binding();
    let gate = ContainmentGate::new(e.profile.clone());
    match gate
        .authorize_admitted(
            &admission.intent,
            &admission.analysis,
            &binding,
            e.store.as_ref(),
        )
        .await
    {
        AuthorizationDecision::Allow { authorization_ref } => Ok(Json(json!({
            "decision": "ADMITTED",
            "authorization_ref": authorization_ref.to_hex(),
            "analysis": admission.analysis_hash().to_hex(),
            "source": admission.source.to_hex(),
            "output": admission.output.to_hex(),
            "invariant_id": admission.analysis.module_id,
            "invariant_version": admission.analysis.module_version,
            "operation_id": admission.intent.operation_id().to_hex(),
        }))),
        AuthorizationDecision::Reject { reason } => Err((StatusCode::FORBIDDEN, reason)),
    }
}
