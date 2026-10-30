//! Run reports from schedulers that cannot build canonical WERs themselves
//! (Laravel `schedule:run`, cron wrappers). The authenticated runtime builds
//! the WER, so the report proves only that a bearer of the API token said the
//! run succeeded; the admission time is the store's, not the reporter's.
use arkhe_core::{canonical::encode_value, worker::WorkerExecutionRecord, Digest32};
use async_trait::async_trait;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

/// Commits a WER the runtime built itself; see `PgWormGraph::commit_verified_worker`.
#[async_trait]
pub trait VerifiedWorkerCommitter: Send + Sync {
    async fn commit_verified_worker(
        &self,
        worker: &WorkerExecutionRecord,
    ) -> Result<Digest32, String>;
}

#[async_trait]
impl VerifiedWorkerCommitter for arkhe_wormgraph::postgres::PgWormGraph {
    async fn commit_verified_worker(
        &self,
        worker: &WorkerExecutionRecord,
    ) -> Result<Digest32, String> {
        arkhe_wormgraph::postgres::PgWormGraph::commit_verified_worker(self, worker).await
    }
}

pub struct RunEndpoint {
    pub store: Arc<dyn VerifiedWorkerCommitter>,
    pub token: String,
    pub actor: String,
}

/// `POST /v1/runs`. Same bearer token as the other runtime routes.
pub fn router(endpoint: Arc<RunEndpoint>) -> Router {
    Router::new()
        .route("/v1/runs", post(admit))
        .with_state(endpoint)
}

async fn admit(
    State(e): State<Arc<RunEndpoint>>,
    headers: HeaderMap,
    Json(report): Json<RunReport>,
) -> Result<Json<Value>, (StatusCode, &'static str)> {
    let expected = format!("Bearer {}", e.token);
    if headers.get("authorization").and_then(|v| v.to_str().ok()) != Some(&expected) {
        return Err((StatusCode::UNAUTHORIZED, "authentication required"));
    }
    let worker = report
        .worker_record(&e.actor)
        .map_err(|m| (StatusCode::BAD_REQUEST, m))?;
    let hash = e
        .store
        .commit_verified_worker(&worker)
        .await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "evidence commit failed"))?;
    Ok(Json(
        json!({"record_hash":hash.to_hex(),"module_id":worker.module_id}),
    ))
}

const MAX_ID_BYTES: usize = 128;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunReport {
    pub module_id: String,
    pub module_version: String,
    /// Unique per run; retries of the same run must reuse it.
    pub execution_id: String,
}

impl RunReport {
    /// The WER this report is admitted as. Identical reports yield the same
    /// WER, so retries keep the first admission time.
    pub fn worker_record(&self, actor: &str) -> Result<WorkerExecutionRecord, &'static str> {
        for (field, value) in [
            ("module_id", &self.module_id),
            ("module_version", &self.module_version),
            ("execution_id", &self.execution_id),
        ] {
            if !is_id(value) {
                return Err(match field {
                    "module_id" => "invalid module_id",
                    "module_version" => "invalid module_version",
                    _ => "invalid execution_id",
                });
            }
        }
        let report = encode_value(&json!({
            "actor": actor, "module_id": self.module_id,
            "module_version": self.module_version, "execution_id": self.execution_id,
        }));
        Ok(WorkerExecutionRecord {
            classification: None,
            operation: None,
            module_id: self.module_id.clone(),
            module_version: self.module_version.clone(),
            input_digest: Digest32::blake3(b"AKG:RUN-REPORT:v1\0", &report),
            output_digest: Digest32::ZERO,
            evidence_refs: vec![],
            confidence_bps: None,
            uncertainty_note: None,
            execution_id: self.execution_id.clone(),
        })
    }
}

fn is_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= MAX_ID_BYTES
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._@+-/:".contains(&b))
}
