//! Verification endpoint for portable receipts.
//!
//! `verify` never reads DATABASE_URL. `serve` records an observation only when
//! DATABASE_URL is set, and that row does not change the verdict. The crate
//! builds without a database because the SQL is a runtime string, not a
//! compile-time query.

use arkhe_flow::{
    verify, AnchorCheckpoint, AnchorInclusionProof, Receipt, Trust, Verdict, VerifyInput,
};
use axum::http::{HeaderMap, StatusCode};
use axum::{extract::State, routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::collections::BTreeMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub const TENANT_ROSTERS_SCHEMA: &str = "arkhe-tenant-rosters/v1";

/// Per-tenant trust rosters (P-05).
///
/// Each tenant maps to one or more allowed [`Trust`] rosters so key rotation
/// can keep older rosters addressable when explicitly named by an auditor,
/// while refusing any cross-tenant trust or receipt mismatch. Never inferred
/// from `X-Arkhe-Seat`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TenantRosters {
    pub schema: String,
    pub tenants: BTreeMap<String, Vec<Trust>>,
}

impl TenantRosters {
    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let parsed: Self = serde_json::from_slice(&std::fs::read(path)?)?;
        if parsed.schema != TENANT_ROSTERS_SCHEMA {
            anyhow::bail!("tenant rosters schema is not {TENANT_ROSTERS_SCHEMA}");
        }
        Ok(parsed)
    }

    /// Check whether `supplied` matches one of the configured rosters for `tenant`.
    pub fn contains_trust(&self, tenant: &str, supplied: &Trust) -> bool {
        let Some(allowed) = self.tenants.get(tenant) else {
            return false;
        };
        allowed.iter().any(|t| {
            t.schema == supplied.schema && t.purpose == supplied.purpose && t.keys == supplied.keys
        })
    }
}

const MIGRATION: &str = "\
CREATE TABLE IF NOT EXISTS provenance_observations (\
  id bigserial PRIMARY KEY,\
  observed_at timestamptz NOT NULL DEFAULT now(),\
  receipt_id text NOT NULL,\
  receipt_kind text NOT NULL,\
  overall text NOT NULL,\
  receipt_sha256 text NOT NULL\
);";

#[derive(Clone)]
pub struct AppState {
    pub pool: Option<PgPool>,
    pub platform: Option<arkhe_platform::Platform>,
    pub caller_auth: Option<arkhe_platform::CallerAuthKey>,
    pub tenant_rosters: Option<TenantRosters>,
}

pub fn router(pool: Option<PgPool>) -> Router {
    router_with(AppState {
        pool,
        platform: None,
        caller_auth: None,
        tenant_rosters: None,
    })
}

pub fn router_with(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/verify", post(verify_http))
        .with_state(state)
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifyRequest {
    pub receipt: Receipt,
    pub trust: Trust,
    pub expect_purpose: Option<String>,
    /// Optional explicit tenant identifier for multi-tenant roster lookup (P-05).
    /// Never inferred from `X-Arkhe-Seat`.
    #[serde(default)]
    pub tenant: Option<String>,
    pub subject_sha256: Option<String>,
    pub policy_sha256: Option<String>,
    pub admission_id: Option<String>,
    pub commit_id: Option<String>,
    pub artifact_sha256: Option<String>,
    pub model_sha256: Option<String>,
    pub data_sha256: Option<String>,
    pub pipeline_sha256: Option<String>,
    pub plan_sha256: Option<String>,
    pub output_sha256: Option<String>,
    pub action_id: Option<String>,
    /// A signed invariant verdict offered to discharge the axiom.
    pub invariant: Option<Receipt>,
    /// The invariant id the caller requires. Without it nothing discharges.
    pub expect_invariant: Option<String>,
    /// Auditor-configured checkpoint for verifiable anchor inclusion (P-02).
    #[serde(default)]
    pub anchor_checkpoint: Option<AnchorCheckpoint>,
    /// RFC 6962 inclusion proof for an anchor receipt (P-02).
    #[serde(default)]
    pub anchor_inclusion: Option<AnchorInclusionProof>,
}

pub async fn connect_if_configured() -> anyhow::Result<Option<PgPool>> {
    let url = match std::env::var("DATABASE_URL") {
        Ok(url) if !url.is_empty() => url,
        _ => return Ok(None),
    };
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .map_err(|error| anyhow::anyhow!("DATABASE_URL is set but PostgreSQL did not connect: {error}"))?;
    sqlx::query(MIGRATION)
        .execute(&pool)
        .await
        .map_err(|error| anyhow::anyhow!("DATABASE_URL is set but provenance_observations was not created: {error}"))?;
    Ok(Some(pool))
}

pub fn handle_mcp_message(message: &Value) -> Option<Value> {
    let method = message.get("method").and_then(Value::as_str).unwrap_or("");
    let id = message.get("id").cloned()?;
    match method {
        "initialize" => Some(mcp_result(id, json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "arkhe-provenance-mcp", "version": "0.1.0" }
        }))),
        "tools/list" => Some(mcp_result(id, json!({
            "tools": [{
                "name": "verify_receipt",
                "description": "Recompute one arkhe-receipt/v1 against a caller-supplied trust file. A PASS does not authorize an effect and is not a payment.",
                "inputSchema": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["receipt", "trust", "expect_purpose"],
                    "properties": {
                        "receipt": { "type": "object" },
                        "trust": { "type": "object" },
                        "expect_purpose": { "type": "string" },
                        "subject_sha256": { "type": "string" },
                        "policy_sha256": { "type": "string" },
                        "admission_id": { "type": "string" },
                        "commit_id": { "type": "string" },
                        "artifact_sha256": { "type": "string" },
                        "model_sha256": { "type": "string" },
                        "data_sha256": { "type": "string" },
                        "pipeline_sha256": { "type": "string" },
                        "plan_sha256": { "type": "string" },
                        "output_sha256": { "type": "string" },
                        "action_id": { "type": "string" },
                        "tenant": { "type": "string" },
                        "invariant": { "type": "object" },
                        "expect_invariant": { "type": "string" },
                        "anchor_checkpoint": { "type": "object" },
                        "anchor_inclusion": { "type": "object" }
                    }
                }
            }]
        }))),
        "tools/call" => Some(mcp_result(id, mcp_tool_call(message))),
        "ping" => Some(mcp_result(id, json!({}))),
        _ => Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32601, "message": "method not found" }
        })),
    }
}

fn mcp_result(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn mcp_tool_call(message: &Value) -> Value {
    let name = message
        .pointer("/params/name")
        .and_then(Value::as_str)
        .unwrap_or("");
    if name != "verify_receipt" {
        return json!({
            "content": [{ "type": "text", "text": "unknown tool" }],
            "isError": true
        });
    }
    let arguments = message.pointer("/params/arguments").cloned().unwrap_or(Value::Null);
    match serde_json::from_value::<VerifyRequest>(arguments) {
        Ok(request) => {
            let verdict = judge(&request);
            json!({
                "content": [{ "type": "text", "text": serde_json::to_string(&verdict).unwrap_or_else(|_| "{}".into()) }],
                "isError": false
            })
        }
        Err(error) => json!({
            "content": [{ "type": "text", "text": error.to_string() }],
            "isError": true
        }),
    }
}

pub fn serve_stdio() -> anyhow::Result<()> {
    use std::io::BufReader;
    let mut reader = BufReader::new(std::io::stdin().lock());
    let mut stdout = std::io::stdout().lock();
    loop {
        let Some(message) = read_frame(&mut reader)? else {
            break;
        };
        if let Some(response) = handle_mcp_message(&message) {
            write_frame(&mut stdout, &response)?;
        }
    }
    Ok(())
}

fn read_frame(reader: &mut impl std::io::BufRead) -> anyhow::Result<Option<Value>> {
    let mut content_length = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 {
            return Ok(None);
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some(rest) = trimmed.strip_prefix("Content-Length:") {
            content_length = Some(rest.trim().parse::<usize>()?);
        }
    }
    let length = content_length.ok_or_else(|| anyhow::anyhow!("mcp frame is missing Content-Length"))?;
    if length > 1_048_576 {
        anyhow::bail!("mcp frame is larger than 1 MiB");
    }
    let mut buffer = vec![0u8; length];
    reader.read_exact(&mut buffer)?;
    Ok(Some(serde_json::from_slice(&buffer)?))
}

fn write_frame(writer: &mut impl std::io::Write, message: &Value) -> anyhow::Result<()> {
    let bytes = serde_json::to_vec(message)?;
    write!(writer, "Content-Length: {}\r\n\r\n", bytes.len())?;
    writer.write_all(&bytes)?;
    writer.flush()?;
    Ok(())
}

pub fn judge(request: &VerifyRequest) -> Verdict {
    judge_with_rosters(request, None)
}

/// Evaluate a verification request, optionally enforcing multi-tenant trust
/// rosters (P-05). Never infers `tenant` from a seat header.
pub fn judge_with_rosters(
    request: &VerifyRequest,
    rosters: Option<&TenantRosters>,
) -> Verdict {
    let mut verdict = verify(VerifyInput {
        receipt: &request.receipt,
        trust: &request.trust,
        expect_purpose: request.expect_purpose.as_deref(),
        subject_sha256: request.subject_sha256.as_deref(),
        policy_sha256: request.policy_sha256.as_deref(),
        admission_id: request.admission_id.as_deref(),
        commit_id: request.commit_id.as_deref(),
        artifact_sha256: request.artifact_sha256.as_deref(),
        model_sha256: request.model_sha256.as_deref(),
        data_sha256: request.data_sha256.as_deref(),
        pipeline_sha256: request.pipeline_sha256.as_deref(),
        plan_sha256: request.plan_sha256.as_deref(),
        output_sha256: request.output_sha256.as_deref(),
        action_id: request.action_id.as_deref(),
        invariant: request.invariant.as_ref(),
        expect_invariant: request.expect_invariant.as_deref(),
        anchor_checkpoint: request.anchor_checkpoint.as_ref(),
        anchor_inclusion: request.anchor_inclusion.as_ref(),
    });

    // Enforce tenant-roster isolation when multi-tenant rosters or explicit tenant are supplied (P-05).
    let receipt_tenant = request
        .receipt
        .body
        .get("tenant")
        .and_then(Value::as_str);

    if let (Some(req_t), Some(rec_t)) = (request.tenant.as_deref(), receipt_tenant) {
        if req_t != rec_t {
            verdict.components.insert("signer".into(), "FAIL".into());
            verdict.overall = "FAIL".into();
            verdict.notes.push(format!(
                "admission receipt tenant '{rec_t}' does not match requested tenant '{req_t}'"
            ));
            return verdict;
        }
    }

    if let Some(tenant_rosters) = rosters {
        let resolved_tenant = request.tenant.as_deref().or(receipt_tenant);
        match resolved_tenant {
            Some(t) if tenant_rosters.contains_trust(t, &request.trust) => {}
            Some(t) => {
                verdict.components.insert("signer".into(), "FAIL".into());
                verdict.overall = "FAIL".into();
                verdict.notes.push(format!(
                    "supplied trust roster is not registered for tenant '{t}'"
                ));
            }
            None => {
                verdict.components.insert("signer".into(), "FAIL".into());
                verdict.overall = "FAIL".into();
                verdict.notes.push(
                    "multi-tenant roster mode requires a tenant on the request or admission receipt"
                        .into(),
                );
            }
        }
    }

    verdict
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "service": "arkhe-provenance-mcp",
        "verify": "ready",
        "auth": if state.caller_auth.is_some() { "operator-signed-token" } else { "absent" },
        "postgres": if state.pool.is_some() { "ready" } else { "absent" },
        "seats": if state.platform.is_some() { "enforced" } else { "absent" },
        "meter": if state.platform.is_some() { "directory" } else { "absent" },
        "tenant_rosters": if state.tenant_rosters.is_some() { "enforced" } else { "absent" }
    }))
}

async fn verify_http(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<VerifyRequest>,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    // P-03: Authenticate caller strictly BEFORE seat checks and BEFORE any verdict calculation.
    let authenticated_seat = if let Some(auth_key) = &state.caller_auth {
        let Some(auth_header) = header_text(&headers, "authorization") else {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "caller authentication required"})),
            )
                .into_response();
        };
        let token = match arkhe_platform::parse_bearer_caller_token(&auth_header) {
            Ok(t) => t,
            Err(_) => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({"error": "invalid caller credential format"})),
                )
                    .into_response();
            }
        };
        let now_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        if arkhe_platform::verify_caller_token(&token, auth_key, now_unix).is_err() {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "caller credential verification failed"})),
            )
                .into_response();
        }
        Some(token.seat)
    } else {
        None
    };

    if let Some(platform) = &state.platform {
        let seat = header_text(&headers, "x-arkhe-seat");
        if seat.is_none() || header_text(&headers, "idempotency-key").is_none() {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "seat and idempotency key are required"}))).into_response();
        }
        let seat = seat.unwrap();
        // P-03: Credential issued for seat A cannot meter against seat B.
        if let Some(token_seat) = &authenticated_seat {
            if token_seat != &seat {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({"error": "caller credential seat does not match X-Arkhe-Seat"})),
                )
                    .into_response();
            }
        }
        if arkhe_platform::require_active(&platform.seats, &seat).is_err() {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "seat is not active"}))).into_response();
        }
    }
    let mut verdict = judge_with_rosters(&request, state.tenant_rosters.as_ref());
    let digest = hex::encode(Sha256::digest(serde_json::to_vec(&request.receipt).unwrap_or_default()));
    verdict.persistence = match &state.pool {
        None => "NOT_PERFORMED".to_string(),
        Some(pool) => match record(pool, &verdict, &digest).await {
            Ok(()) => "RECORDED".to_string(),
            Err(_) => "UNAVAILABLE".to_string(),
        },
    };
    if let Some(platform) = &state.platform {
        let seat = header_text(&headers, "x-arkhe-seat").unwrap();
        let key = header_text(&headers, "idempotency-key").unwrap();
        let event = arkhe_platform::MeterEvent {
            schema: "arkhe-meter/v1".into(),
            idempotency_key: key,
            seat,
            receipt_id: verdict.receipt_id.clone(),
            overall: verdict.overall.clone(),
            units: 1,
        };
        if let Err(error) = arkhe_platform::record(&platform.meter_dir, &event) {
            let status = if error.to_string().contains("another receipt") {
                StatusCode::CONFLICT
            } else {
                StatusCode::BAD_REQUEST
            };
            return (status, Json(json!({"error": error.to_string()}))).into_response();
        }
    }
    Json(verdict).into_response()
}

fn header_text(headers: &HeaderMap, name: &str) -> Option<String> {
    headers.get(name).and_then(|value| value.to_str().ok()).map(|value| value.to_string())
}

async fn record(pool: &PgPool, verdict: &Verdict, digest: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO provenance_observations (receipt_id, receipt_kind, overall, receipt_sha256) VALUES ($1, $2, $3, $4)",
    )
    .bind(&verdict.receipt_id)
    .bind(&verdict.kind)
    .bind(&verdict.overall)
    .bind(digest)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use arkhe_flow::{emit_gate0, sha256_hex, GATE0_PURPOSE, GATE0_SUBJECT, policy_bytes};
    use std::time::{SystemTime, UNIX_EPOCH};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn endpoint_logic_does_not_read_a_database() {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("arkhe-mcp-{stamp}"));
        emit_gate0(&dir).unwrap();
        let request = VerifyRequest {
            receipt: arkhe_flow::read_json(&dir.join("admission.json")).unwrap(),
            trust: arkhe_flow::read_json(&dir.join("trust.json")).unwrap(),
            expect_purpose: Some(GATE0_PURPOSE.to_string()),
            tenant: None,
            subject_sha256: Some(sha256_hex(GATE0_SUBJECT)),
            policy_sha256: Some(sha256_hex(&policy_bytes())),
            admission_id: None,
            commit_id: None,
            artifact_sha256: None,
            model_sha256: None,
            data_sha256: None,
            pipeline_sha256: None,
            plan_sha256: None,
            output_sha256: None,
            action_id: None,
            invariant: None,
            expect_invariant: None,
            anchor_checkpoint: None,
            anchor_inclusion: None,
        };
        let verdict = judge(&request);
        assert_eq!(verdict.overall, "PASS");
        assert_eq!(verdict.persistence, "NOT_PERFORMED");
        let _ = std::fs::remove_dir_all(dir);
    }

    /// The discharge over the same entry point the HTTP route and the MCP tool
    /// use. The action alone is inconclusive; named, with its verdict beside
    /// it, it passes. No database is involved in either.
    #[test]
    fn judge_discharges_the_axiom_only_with_a_named_verdict() {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("arkhe-mcp-agent-{stamp}"));
        emit_gate0(&dir).unwrap();
        let trust: arkhe_flow::Trust = arkhe_flow::read_json(&dir.join("trust.json")).unwrap();
        let action: Receipt = arkhe_flow::read_json(&dir.join("action.json")).unwrap();
        let signed_verdict: Receipt = arkhe_flow::read_json(&dir.join("verdict.json")).unwrap();
        let artifact = sha256_hex(&std::fs::read(dir.join("artifact.bin")).unwrap());
        let plan = sha256_hex(&std::fs::read(dir.join("plan.json")).unwrap());
        let model = sha256_hex(&std::fs::read(dir.join("model.json")).unwrap());
        let _ = std::fs::remove_dir_all(&dir);

        let request = |invariant: Option<Receipt>, expect: Option<&str>| VerifyRequest {
            receipt: action.clone(),
            trust: trust.clone(),
            expect_purpose: Some(GATE0_PURPOSE.to_string()),
            tenant: None,
            subject_sha256: None,
            policy_sha256: None,
            admission_id: None,
            commit_id: None,
            artifact_sha256: Some(artifact.clone()),
            model_sha256: Some(model.clone()),
            data_sha256: None,
            pipeline_sha256: None,
            plan_sha256: Some(plan.clone()),
            output_sha256: Some(artifact.clone()),
            action_id: None,
            invariant,
            expect_invariant: expect.map(str::to_owned),
            anchor_checkpoint: None,
            anchor_inclusion: None,
        };

        let bare = judge(&request(None, None));
        assert_eq!(bare.components["llm_output"], "INCONCLUSIVE");
        assert_eq!(bare.overall, "INCONCLUSIVE");

        let named = judge(&request(
            Some(signed_verdict),
            Some(arkhe_flow::GATE0_INVARIANT_ID),
        ));
        assert_eq!(named.components["llm_output"], "PASS");
        assert_eq!(named.overall, "PASS");
        assert_eq!(named.persistence, "NOT_PERFORMED");
    }

    #[tokio::test]
    async fn health_serves_without_database_url() {
        let previous = std::env::var("DATABASE_URL").ok();
        std::env::remove_var("DATABASE_URL");
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let pool = connect_if_configured().await.unwrap();
        assert!(pool.is_none());
        tokio::spawn(async move {
            axum::serve(listener, router(pool)).await.unwrap();
        });
        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        stream
            .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut buffer = Vec::new();
        stream.read_to_end(&mut buffer).await.unwrap();
        let text = String::from_utf8(buffer).unwrap();
        assert!(text.contains("\"postgres\":\"absent\""), "{text}");
        assert!(text.contains("\"verify\":\"ready\""));
        if let Some(url) = previous {
            std::env::set_var("DATABASE_URL", url);
        }
    }

    #[test]
    fn mcp_tool_recomputes_the_lab_admission() {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("arkhe-mcp-stdio-{stamp}"));
        emit_gate0(&dir).unwrap();
        let receipt: serde_json::Value = arkhe_flow::read_json(&dir.join("admission.json")).unwrap();
        let trust: serde_json::Value = arkhe_flow::read_json(&dir.join("trust.json")).unwrap();
        let response = handle_mcp_message(&json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "verify_receipt",
                "arguments": {
                    "receipt": receipt,
                    "trust": trust,
                    "expect_purpose": GATE0_PURPOSE,
                    "subject_sha256": sha256_hex(GATE0_SUBJECT),
                    "policy_sha256": sha256_hex(&policy_bytes())
                }
            }
        }))
        .unwrap();
        let text = response.pointer("/result/content/0/text").and_then(|value| value.as_str()).unwrap();
        let verdict: serde_json::Value = serde_json::from_str(text).unwrap();
        assert_eq!(verdict["overall"], "PASS");
        assert_eq!(response["result"]["isError"], false);
        let _ = std::fs::remove_dir_all(dir);
    }

    async fn raw_http_request(
        addr: std::net::SocketAddr,
        method: &str,
        path: &str,
        headers: &[(&str, &str)],
        body: &[u8],
    ) -> (u16, String) {
        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        let mut req = format!(
            "{method} {path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n",
            body.len()
        );
        for (k, v) in headers {
            req.push_str(&format!("{k}: {v}\r\n"));
        }
        req.push_str("\r\n");
        stream.write_all(req.as_bytes()).await.unwrap();
        stream.write_all(body).await.unwrap();
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.unwrap();
        let text = String::from_utf8(buf).unwrap();
        let status = text
            .lines()
            .next()
            .unwrap()
            .split_whitespace()
            .nth(1)
            .unwrap()
            .parse::<u16>()
            .unwrap();
        (status, text)
    }

    /// P-03: Caller authentication separated from `X-Arkhe-Seat`:
    /// - Missing credential -> 401 before verdict or metering
    /// - Valid credential for inactive seat -> 403
    /// - Valid credential for seat A attempting to meter seat B -> 403 and 0 meter lines
    /// - Valid credential for active seat A -> 200 PASS and 1 meter line
    /// - `/health` declares `"auth":"operator-signed-token"`
    #[tokio::test]
    async fn p03_caller_auth_enforces_401_and_prevents_cross_seat_metering() {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("arkhe-p03-http-{stamp}"));
        let meter_dir = dir.join("meter");
        emit_gate0(&dir).unwrap();

        let op_seed = [0x99u8; 32];
        let op_pub = hex::encode(
            ed25519_dalek::SigningKey::from_bytes(&op_seed)
                .verifying_key()
                .to_bytes(),
        );
        let auth_key = arkhe_platform::CallerAuthKey {
            schema: arkhe_platform::CALLER_AUTH_KEY_SCHEMA.into(),
            public_key_hex: op_pub,
        };
        let seats = arkhe_platform::SeatFile {
            schema: "arkhe-seats/v1".into(),
            seat_limit: 5,
            seats: vec![
                arkhe_platform::Seat { id: "seat-a".into(), label: "Seat A".into(), active: true },
                arkhe_platform::Seat { id: "seat-b".into(), label: "Seat B".into(), active: true },
                arkhe_platform::Seat { id: "seat-off".into(), label: "Inactive".into(), active: false },
            ],
        };
        let state = AppState {
            pool: None,
            platform: Some(arkhe_platform::Platform {
                seats,
                meter_dir: meter_dir.clone(),
            }),
            caller_auth: Some(auth_key),
            tenant_rosters: None,
        };

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, router_with(state)).await.unwrap();
        });

        let (h_status, h_text) = raw_http_request(addr, "GET", "/health", &[], b"").await;
        assert_eq!(h_status, 200);
        assert!(h_text.contains("\"auth\":\"operator-signed-token\""), "{h_text}");

        let receipt: Value = arkhe_flow::read_json(&dir.join("admission.json")).unwrap();
        let trust: Value = arkhe_flow::read_json(&dir.join("trust.json")).unwrap();
        let payload = serde_json::to_vec(&json!({
            "receipt": receipt,
            "trust": trust,
            "expect_purpose": GATE0_PURPOSE,
            "subject_sha256": sha256_hex(GATE0_SUBJECT),
            "policy_sha256": sha256_hex(&policy_bytes()),
        }))
        .unwrap();

        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
        let tok_a = arkhe_platform::sign_caller_token("seat-a", "svc-a", now - 60, now + 600, "n1", op_seed).unwrap();
        let tok_off = arkhe_platform::sign_caller_token("seat-off", "svc-off", now - 60, now + 600, "n2", op_seed).unwrap();
        let auth_a = format!("Bearer {}", hex::encode(serde_json::to_vec(&tok_a).unwrap()));
        let auth_off = format!("Bearer {}", hex::encode(serde_json::to_vec(&tok_off).unwrap()));

        // 1. No credential -> 401 before verdict calculation or metering.
        let (s1, _) = raw_http_request(
            addr,
            "POST",
            "/v1/verify",
            &[("X-Arkhe-Seat", "seat-a"), ("Idempotency-Key", "k-unauth")],
            &payload,
        )
        .await;
        assert_eq!(s1, 401);

        // 2. Valid credential for inactive seat -> 403.
        let (s2, _) = raw_http_request(
            addr,
            "POST",
            "/v1/verify",
            &[
                ("Authorization", &auth_off),
                ("X-Arkhe-Seat", "seat-off"),
                ("Idempotency-Key", "k-inactive"),
            ],
            &payload,
        )
        .await;
        assert_eq!(s2, 403);

        // 3. Valid credential for seat-a attempting to meter seat-b -> 403 and 0 meter lines!
        let (s3, _) = raw_http_request(
            addr,
            "POST",
            "/v1/verify",
            &[
                ("Authorization", &auth_a),
                ("X-Arkhe-Seat", "seat-b"),
                ("Idempotency-Key", "k-cross-seat"),
            ],
            &payload,
        )
        .await;
        assert_eq!(s3, 403);
        assert!(
            !meter_dir.join("events.jsonl").exists(),
            "rejected cross-seat/unauth requests must write zero meter lines"
        );

        // 4. Valid credential matching active seat-a -> 200 PASS and exactly 1 meter line.
        let (s4, t4) = raw_http_request(
            addr,
            "POST",
            "/v1/verify",
            &[
                ("Authorization", &auth_a),
                ("X-Arkhe-Seat", "seat-a"),
                ("Idempotency-Key", "k-ok-1"),
            ],
            &payload,
        )
        .await;
        assert_eq!(s4, 200, "{t4}");
        assert!(t4.contains("\"overall\":\"PASS\""), "{t4}");
        let lines = std::fs::read_to_string(meter_dir.join("events.jsonl")).unwrap();
        assert_eq!(lines.lines().count(), 1);

        let _ = std::fs::remove_dir_all(dir);
    }

    /// P-05: Multi-tenant roster isolation and key-rotation continuity:
    /// - Receipt of tenant A verified against roster of tenant B -> `signer: FAIL`
    /// - Rotating tenant A's key does not invalidate old tenant A receipts when
    ///   verified against tenant A's named historical roster.
    #[test]
    fn p05_multi_tenant_rosters_isolate_tenants_and_preserve_rotation_history() {
        use arkhe_flow::{admission_body, secret_from_seed, sign_body, trust_from_secrets};

        let a_flow_v1 = secret_from_seed("flow", [0x11; 32]).unwrap();
        let a_stor_v1 = secret_from_seed("storage", [0x12; 32]).unwrap();
        let a_anch_v1 = secret_from_seed("anchor", [0x13; 32]).unwrap();
        let trust_a_v1 = trust_from_secrets("tenant-a-v1", &[a_flow_v1.clone(), a_stor_v1, a_anch_v1]).unwrap();

        let a_flow_v2 = secret_from_seed("flow", [0x21; 32]).unwrap();
        let a_stor_v2 = secret_from_seed("storage", [0x22; 32]).unwrap();
        let a_anch_v2 = secret_from_seed("anchor", [0x23; 32]).unwrap();
        let trust_a_v2 = trust_from_secrets("tenant-a-v2", &[a_flow_v2.clone(), a_stor_v2, a_anch_v2]).unwrap();

        let b_flow = secret_from_seed("flow", [0x31; 32]).unwrap();
        let b_stor = secret_from_seed("storage", [0x32; 32]).unwrap();
        let b_anch = secret_from_seed("anchor", [0x33; 32]).unwrap();
        let trust_b = trust_from_secrets("tenant-b-v1", &[b_flow, b_stor, b_anch]).unwrap();

        let mut tenants = BTreeMap::new();
        tenants.insert("tenant-a".into(), vec![trust_a_v1.clone(), trust_a_v2.clone()]);
        tenants.insert("tenant-b".into(), vec![trust_b.clone()]);
        let rosters = TenantRosters {
            schema: TENANT_ROSTERS_SCHEMA.into(),
            tenants,
        };

        let subj = sha256_hex(b"doc-a");
        let pol = sha256_hex(&policy_bytes());
        let receipt_a_v1 = sign_body(&a_flow_v1, &admission_body("tenant-a", "emit", &subj, &pol).unwrap()).unwrap();
        let receipt_a_v2 = sign_body(&a_flow_v2, &admission_body("tenant-a", "emit", &subj, &pol).unwrap()).unwrap();

        let make_req = |receipt: Receipt, trust: Trust, purpose: &str, tenant: Option<&str>| VerifyRequest {
            receipt,
            trust,
            expect_purpose: Some(purpose.into()),
            tenant: tenant.map(str::to_owned),
            subject_sha256: Some(subj.clone()),
            policy_sha256: Some(pol.clone()),
            admission_id: None,
            commit_id: None,
            artifact_sha256: None,
            model_sha256: None,
            data_sha256: None,
            pipeline_sha256: None,
            plan_sha256: None,
            output_sha256: None,
            action_id: None,
            invariant: None,
            expect_invariant: None,
            anchor_checkpoint: None,
            anchor_inclusion: None,
        };

        // Cross-tenant attempt: tenant A receipt against tenant B roster -> signer: FAIL.
        let cross = judge_with_rosters(
            &make_req(receipt_a_v1.clone(), trust_b.clone(), "tenant-b-v1", Some("tenant-b")),
            Some(&rosters),
        );
        assert_eq!(cross.components["signer"], "FAIL");
        assert_eq!(cross.overall, "FAIL");

        // Cross-tenant attempt passing tenant-a receipt with tenant-b's trust under tenant-a -> signer: FAIL.
        let spoof = judge_with_rosters(
            &make_req(receipt_a_v1.clone(), trust_b, "tenant-b-v1", Some("tenant-a")),
            Some(&rosters),
        );
        assert_eq!(spoof.components["signer"], "FAIL");
        assert_eq!(spoof.overall, "FAIL");

        // Key rotation: old tenant-a receipt still verifies against named trust_a_v1,
        // and new tenant-a receipt verifies against named trust_a_v2.
        let old_ok = judge_with_rosters(
            &make_req(receipt_a_v1, trust_a_v1, "tenant-a-v1", Some("tenant-a")),
            Some(&rosters),
        );
        assert_eq!(old_ok.components["signer"], "PASS");
        assert_eq!(old_ok.overall, "PASS");

        let new_ok = judge_with_rosters(
            &make_req(receipt_a_v2, trust_a_v2, "tenant-a-v2", Some("tenant-a")),
            Some(&rosters),
        );
        assert_eq!(new_ok.components["signer"], "PASS");
        assert_eq!(new_ok.overall, "PASS");
    }
}
