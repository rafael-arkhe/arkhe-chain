//! `POST /v1/tasks` over the real router.
//!
//! The same record, posted twice with one field changed, has to come back
//! ADMITTED or EXCLUDED. Nothing here asserts on the adapter alone: every case
//! goes through the handler, the invariant, the store and the kernel.

use arkhe_core::{work::WorkIntentType, Digest32};
use arkhe_exec_adapter::{invariants::NoDirectIdentifier, InvariantProfile, Registry};
use arkhe_runtime::task_admission::{router, TaskEndpoint};
use arkhe_wormgraph::WormGraph;
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use std::sync::Arc;
use tower::ServiceExt;

const TOKEN: &str = "synthetic-token-synthetic-token-0";
const INVARIANT: &str = "invariant.no-direct-identifier";

fn body(output: &[u8], invariant: &str, intent: &str) -> String {
    let target = Digest32::blake3(b"TEST:TARGET\0", b"registro-sintetico").to_hex();
    format!(
        r#"{{"intent_type":"{intent}","target":"{target}","invariant_id":"{invariant}",
            "request_key":"req-0001","claimed_created_at":1763000000,
            "module_id":"claude.computer-use","module_version":"2026.11.18",
            "execution_id":"run-0001","output":"{}"}}"#,
        hex::encode(output)
    )
}

async fn post(store: Arc<WormGraph>, auth: Option<&str>, payload: &str) -> (StatusCode, String) {
    let app = router(Arc::new(TaskEndpoint {
        store,
        token: TOKEN.into(),
        actor: "ops".into(),
        registry: Registry::new().with(Box::new(NoDirectIdentifier)),
        profile: InvariantProfile {
            policy_id: "exec-adapter-test".into(),
            version: 1,
            allowed: vec![(WorkIntentType::Publish, INVARIANT.into())],
        },
    }));
    let mut req = Request::builder()
        .method("POST")
        .uri("/v1/tasks")
        .header("content-type", "application/json");
    if let Some(auth) = auth {
        req = req.header("authorization", auth);
    }
    let res = app
        .oneshot(req.body(Body::from(payload.to_owned())).unwrap())
        .await
        .unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), 1 << 16).await.unwrap();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

fn bearer() -> String {
    format!("Bearer {TOKEN}")
}

const RELEASED: &[u8] = br#"{"municipio":"Goiania","faixa_etaria":"30-39"}"#;
const CARRIES_CPF: &[u8] = br#"{"municipio":"Goiania","cpf":"529.982.247-25"}"#;

#[tokio::test]
async fn a_suppressed_record_is_admitted() {
    let store = Arc::new(WormGraph::new());
    let (status, text) = post(
        store,
        Some(&bearer()),
        &body(RELEASED, INVARIANT, "Publish"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{text}");

    let json: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(json["decision"], "ADMITTED");
    assert_eq!(json["invariant_id"], INVARIANT);
    assert_eq!(json["authorization_ref"].as_str().unwrap().len(), 64);
    // The three digests an auditor needs to replay the check.
    for field in ["analysis", "source", "output", "operation_id"] {
        assert_eq!(
            json[field].as_str().unwrap().len(),
            64,
            "{field} is not a digest"
        );
    }
}

/// 403, not 200 with a sad field: an excluded run must not look like a
/// successful request to a client that only reads the status.
#[tokio::test]
async fn a_record_carrying_an_identifier_is_excluded() {
    let store = Arc::new(WormGraph::new());
    let (status, text) = post(
        store,
        Some(&bearer()),
        &body(CARRIES_CPF, INVARIANT, "Publish"),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(text.contains(INVARIANT), "{text}");
    assert!(text.contains("labeled"), "{text}");
}

#[tokio::test]
async fn an_invariant_this_process_does_not_have_is_excluded() {
    let store = Arc::new(WormGraph::new());
    let (status, text) = post(
        store,
        Some(&bearer()),
        &body(RELEASED, "invariant.not-written-yet", "Publish"),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(text.contains("no invariant registered"), "{text}");
}

/// The invariant held, and governance never opted this task class in.
#[tokio::test]
async fn a_task_class_outside_the_profile_is_refused_by_the_kernel() {
    let store = Arc::new(WormGraph::new());
    let (status, text) = post(
        store,
        Some(&bearer()),
        &body(RELEASED, INVARIANT, "ReleaseSoftware"),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(text, "missing worker evidence policy");
}

#[tokio::test]
async fn missing_or_wrong_token_admits_nothing() {
    let store = Arc::new(WormGraph::new());
    for auth in [None, Some("Bearer wrong"), Some(TOKEN)] {
        let (status, _) = post(store.clone(), auth, &body(RELEASED, INVARIANT, "Publish")).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
}

/// `requested_by` is the authenticated actor. It is not a field, so a caller
/// that tries to send one is refused rather than quietly ignored.
#[tokio::test]
async fn a_caller_cannot_name_the_requester() {
    let store = Arc::new(WormGraph::new());
    let payload = body(RELEASED, INVARIANT, "Publish").replace(
        r#""module_id""#,
        r#""requested_by":"someone-else","module_id""#,
    );
    let (status, _) = post(store, Some(&bearer()), &payload).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn an_unusable_target_or_output_is_a_bad_request() {
    let store = Arc::new(WormGraph::new());
    let auth = bearer();

    let short = body(RELEASED, INVARIANT, "Publish").replace(
        &Digest32::blake3(b"TEST:TARGET\0", b"registro-sintetico").to_hex(),
        "abcd",
    );
    let (status, text) = post(store.clone(), Some(&auth), &short).await;
    assert_eq!(
        (status, text.as_str()),
        (StatusCode::BAD_REQUEST, "target is not a 32-byte digest")
    );

    let payload = body(RELEASED, INVARIANT, "Publish");
    let not_hex = payload.replace(&hex::encode(RELEASED), "zzzz");
    let (status, text) = post(store.clone(), Some(&auth), &not_hex).await;
    assert_eq!(
        (status, text.as_str()),
        (StatusCode::BAD_REQUEST, "output is not hex")
    );

    let empty = payload.replace(&hex::encode(RELEASED), "");
    let (status, text) = post(store, Some(&auth), &empty).await;
    assert_eq!(
        (status, text.as_str()),
        (StatusCode::BAD_REQUEST, "malformed run: output")
    );
}

/// A retry of the same request reaches the same operation, so a client that
/// posts twice does not open two.
#[tokio::test]
async fn an_identical_retry_reaches_the_same_operation() {
    let store = Arc::new(WormGraph::new());
    let payload = body(RELEASED, INVARIANT, "Publish");
    let (first_status, first) = post(store.clone(), Some(&bearer()), &payload).await;
    let (second_status, second) = post(store, Some(&bearer()), &payload).await;
    assert_eq!(
        (first_status, second_status),
        (StatusCode::OK, StatusCode::OK)
    );

    let a: serde_json::Value = serde_json::from_str(&first).unwrap();
    let b: serde_json::Value = serde_json::from_str(&second).unwrap();
    assert_eq!(a["operation_id"], b["operation_id"]);
    assert_eq!(a["authorization_ref"], b["authorization_ref"]);
}
