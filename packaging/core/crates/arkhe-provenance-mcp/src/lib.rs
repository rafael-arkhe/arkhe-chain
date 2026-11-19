//! Verification endpoint for portable receipts.
//!
//! `verify` never reads DATABASE_URL. `serve` records an observation only when
//! DATABASE_URL is set, and that row does not change the verdict. The crate
//! builds without a database because the SQL is a runtime string, not a
//! compile-time query.

use arkhe_flow::{verify, Receipt, Trust, Verdict, VerifyInput};
use axum::http::{HeaderMap, StatusCode};
use axum::{extract::State, routing::{get, post}, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

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
}

pub fn router(pool: Option<PgPool>) -> Router {
    router_with(AppState { pool, platform: None })
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
    let id = message.get("id").cloned();
    if id.is_none() {
        return None;
    }
    let id = id.unwrap();
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
                        "invariant": { "type": "object" },
                        "expect_invariant": { "type": "string" }
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
    verify(VerifyInput {
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
    })
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "service": "arkhe-provenance-mcp",
        "verify": "ready",
        "postgres": if state.pool.is_some() { "ready" } else { "absent" },
        "seats": if state.platform.is_some() { "enforced" } else { "absent" },
        "meter": if state.platform.is_some() { "directory" } else { "absent" }
    }))
}

async fn verify_http(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<VerifyRequest>,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    if let Some(platform) = &state.platform {
        let seat = header_text(&headers, "x-arkhe-seat");
        if seat.is_none() || header_text(&headers, "idempotency-key").is_none() {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "seat and idempotency key are required"}))).into_response();
        }
        let seat = seat.unwrap();
        if arkhe_platform::require_active(&platform.seats, &seat).is_err() {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "seat is not active"}))).into_response();
        }
    }
    let mut verdict = judge(&request);
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
}
