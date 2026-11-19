use arkhe_core::CanonicalEncode;
use arkhe_core::{
    evidence::EvidenceReader,
    work::{WorkIntent, WorkIntentType},
    worker::WorkerExecutionRecord,
    Digest32,
};
use arkhe_exec_adapter::{invariants::NoDirectIdentifier, InvariantProfile, Registry};
use arkhe_governance::{DevPolicyResolver, PolicyBinding};
use arkhe_kernel::ContainmentGate;
use arkhe_runtime::{
    run_report::{self, RunEndpoint},
    task_admission::{self, TaskEndpoint},
    Runtime, WorkCommitError,
};
use arkhe_verify_core::absence::ExpectationSpec;
use arkhe_wormgraph::{
    absence::audit_and_record, postgres::PgWormGraph, retention::RetentionPolicy,
};
use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{env, sync::Arc};

struct LiveState {
    runtime: Runtime<DevPolicyResolver>,
    store: Arc<PgWormGraph>,
    policy: PolicyBinding,
    token: String,
    actor: String,
    retention: RetentionPolicy,
}
type ApiError = (StatusCode, &'static str);
fn authenticate(headers: &HeaderMap, state: &LiveState) -> Result<(), ApiError> {
    let expected = format!("Bearer {}", state.token);
    if headers.get("authorization").and_then(|v| v.to_str().ok()) != Some(&expected) {
        return Err((StatusCode::UNAUTHORIZED, "authentication required"));
    }
    Ok(())
}
fn digest(s: &str) -> Result<Digest32, ApiError> {
    let bytes = hex::decode(s).map_err(|_| (StatusCode::BAD_REQUEST, "invalid digest"))?;
    Ok(Digest32(bytes.try_into().map_err(|_| {
        (StatusCode::BAD_REQUEST, "invalid digest")
    })?))
}
async fn health(
    State(s): State<Arc<LiveState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authenticate(&headers, &s)?;
    s.store.health().await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "evidence store unavailable",
        )
    })?;
    Ok(Json(json!({"status":"ok"})))
}
async fn retention(
    State(s): State<Arc<LiveState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authenticate(&headers, &s)?;
    Ok(Json(json!({
        "policy": s.retention,
        "storage_mode": "append-only-no-purge",
        "automatic_deletion": false,
        "external_archive_configured": false,
        "operational_retention_evidence": "NOT_MEASURED"
    })))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProposedWork {
    intent: WorkIntent,
    worker_record: WorkerExecutionRecord,
}
async fn commit(
    State(s): State<Arc<LiveState>>,
    headers: HeaderMap,
    Json(work): Json<ProposedWork>,
) -> Result<Json<Value>, ApiError> {
    authenticate(&headers, &s)?;
    if work.intent.requested_by != s.actor {
        return Err((StatusCode::FORBIDDEN, "request actor mismatch"));
    }
    let receipt = s
        .runtime
        .commit_proposed_work(&*s.store, &work.intent, &work.worker_record, &s.policy)
        .await
        .map_err(|e| match e {
            WorkCommitError::Rejected(_) => (StatusCode::FORBIDDEN, "authorization rejected"),
            WorkCommitError::Storage(_) => {
                (StatusCode::SERVICE_UNAVAILABLE, "evidence commit failed")
            }
        })?;
    Ok(Json(
        json!({"record_hash":receipt.to_hex(),"intent_digest":work.intent.digest().to_hex(),"worker_digest":work.worker_record.digest().to_hex()}),
    ))
}
/// `audit-expectation <spec.json> [from_window]`: one audit pass. Prints the
/// outcome; the caller keeps `next_window` and schedules the next pass.
async fn audit_expectation(path: &str, from_window: u64) -> Result<(), Box<dyn std::error::Error>> {
    let spec: ExpectationSpec = serde_json::from_slice(&std::fs::read(path)?)?;
    let expectation = spec.expectation()?;
    let store = PgWormGraph::connect(&env::var("DATABASE_URL")?, &env::var("ARKHE_TENANT_ID")?)
        .await
        .map_err(std::io::Error::other)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();
    let outcome = audit_and_record(&store, &store, &expectation, from_window, now)
        .await
        .map_err(std::io::Error::other)?;
    let absences: Vec<Value> = outcome
        .absences
        .iter()
        .map(|r| {
            json!({"window_index":r.window_index,"window_start_unix":r.window_start_unix,
                "window_end_unix":r.window_end_unix,"record_hash":r.object_digest().to_hex()})
        })
        .collect();
    println!(
        "{}",
        json!({"expectation_digest":outcome.expectation_digest.to_hex(),"audited_at_unix":now,
            "next_window":outcome.next_window,"absences":absences})
    );
    Ok(())
}
async fn read(
    State(s): State<Arc<LiveState>>,
    headers: HeaderMap,
    Path(hash): Path<String>,
) -> Result<Json<arkhe_core::evidence::EvidenceEnvelope>, ApiError> {
    authenticate(&headers, &s)?;
    s.store
        .get(digest(&hash)?)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "evidence store unavailable",
            )
        })?
        .map(Json)
        .ok_or((StatusCode::NOT_FOUND, "evidence not found"))
}
async fn object(
    State(s): State<Arc<LiveState>>,
    headers: HeaderMap,
    Path((kind, hash)): Path<(String, String)>,
) -> Result<Vec<u8>, ApiError> {
    authenticate(&headers, &s)?;
    if !matches!(kind.as_str(), "WorkIntent" | "WorkerExecutionRecord") {
        return Err((StatusCode::NOT_FOUND, "object type not found"));
    }
    s.store
        .canonical_object(&kind, digest(&hash)?)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "evidence store unavailable",
            )
        })?
        .ok_or((StatusCode::NOT_FOUND, "object not found"))
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if env::args().nth(1).as_deref() == Some("migrate") {
        PgWormGraph::migrate(&env::var("DATABASE_URL")?)
            .await
            .map_err(std::io::Error::other)?;
        println!("arkhe-sql migrations applied and checksums verified");
        return Ok(());
    }
    if env::args().nth(1).as_deref() == Some("audit-expectation") {
        let path = env::args()
            .nth(2)
            .ok_or("usage: arkhe-runtime audit-expectation <spec.json> [from_window]")?;
        let from_window = env::args()
            .nth(3)
            .map(|v| v.parse())
            .transpose()?
            .unwrap_or(0);
        return audit_expectation(&path, from_window).await;
    }
    let retention_policy = RetentionPolicy::from_settings(
        env::var("ARKHE_EVIDENCE_RETENTION_DAYS").ok().as_deref(),
        env::var("ARKHE_EVIDENCE_IMMEDIATE_DAYS").ok().as_deref(),
    )
    .map_err(std::io::Error::other)?;
    let token = env::var("ARKHE_API_TOKEN")?;
    if token.len() < 32 {
        return Err("ARKHE_API_TOKEN must contain at least 32 bytes".into());
    }
    let actor = env::var("ARKHE_ACTOR")?;
    if actor.trim().is_empty() {
        return Err("ARKHE_ACTOR is required".into());
    }
    let store = Arc::new(
        PgWormGraph::connect(&env::var("DATABASE_URL")?, &env::var("ARKHE_TENANT_ID")?)
            .await
            .map_err(std::io::Error::other)?,
    );
    let runs = run_report::router(Arc::new(RunEndpoint {
        store: store.clone(),
        token: token.clone(),
        actor: actor.clone(),
    }));
    // A development profile, exactly as unproven as the policy below: one task
    // class, one invariant, written in the binary. A real deployment supplies a
    // signed profile and does not hardcode which invariant may stand as the
    // analysis for which transition.
    let tasks = task_admission::router(Arc::new(TaskEndpoint {
        store: store.clone(),
        token: token.clone(),
        actor: actor.clone(),
        registry: Registry::new().with(Box::new(NoDirectIdentifier)),
        profile: InvariantProfile {
            policy_id: "exec-adapter-dev-v1".into(),
            version: 1,
            allowed: vec![(
                WorkIntentType::Publish,
                "invariant.no-direct-identifier".into(),
            )],
        },
    }));
    let policy = PolicyBinding {
        policy_id: "development-unprotected-v1".into(),
        version: 1,
        policy_digest: Digest32::blake3(
            b"AKG:DEV-POLICY:v0-REF\0",
            b"DraftDocument|QueryKnowledgeBase|Simulate",
        ),
    };
    let state = Arc::new(LiveState {
        runtime: Runtime {
            gate: ContainmentGate::new(DevPolicyResolver),
        },
        store,
        policy,
        token,
        actor,
        retention: retention_policy,
    });
    let app = arkhe_runtime::http_routes::versioned_routes(
        get(health),
        post(commit),
        get(read),
        get(object),
        get(retention),
    )
    .with_state(state)
    .merge(runs)
    .merge(tasks)
    .layer(DefaultBodyLimit::max(262144));
    let listener = tokio::net::TcpListener::bind(
        env::var("ARKHE_LISTEN").unwrap_or_else(|_| "127.0.0.1:8788".into()),
    )
    .await?;
    println!("Arkhe runtime listening on {}", listener.local_addr()?);
    axum::serve(listener, app).await?;
    Ok(())
}
