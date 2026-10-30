use arkhe_core::expectation::Admission;
use arkhe_runtime::run_report::RunReport;

fn report(id: &str) -> RunReport {
    RunReport {
        module_id: "billing-cron".into(),
        module_version: "a1b2c3d".into(),
        execution_id: id.into(),
    }
}

#[test]
fn retries_of_one_run_are_one_wer_and_runs_differ() {
    let a = report("2026-10-30T10:00:00Z").worker_record("ops").unwrap();
    let again = report("2026-10-30T10:00:00Z").worker_record("ops").unwrap();
    let next = report("2026-10-30T11:00:00Z").worker_record("ops").unwrap();
    assert_eq!(a.digest(), again.digest());
    assert_ne!(a.digest(), next.digest());
    // A different actor reporting the same run is a different record.
    let other = report("2026-10-30T10:00:00Z")
        .worker_record("intruder")
        .unwrap();
    assert_ne!(a.digest(), other.digest());
}

#[test]
fn the_admitted_wer_counts_for_its_module() {
    use arkhe_core::CanonicalEncode;
    let w = report("r1").worker_record("ops").unwrap();
    let admission = Admission::from_wer_bytes(42, &w.canonical_bytes()).unwrap();
    assert_eq!(admission.module_id, "billing-cron");
}

#[test]
fn unsafe_identifiers_are_rejected() {
    let mut r = report("r1");
    r.module_id = "billing cron".into();
    assert_eq!(r.worker_record("ops").unwrap_err(), "invalid module_id");
    let mut r = report("");
    assert_eq!(r.worker_record("ops").unwrap_err(), "invalid execution_id");
    r = report("r1");
    r.module_version = "x".repeat(129);
    assert_eq!(
        r.worker_record("ops").unwrap_err(),
        "invalid module_version"
    );
}

#[test]
fn unknown_fields_are_rejected() {
    let body = r#"{"module_id":"m","module_version":"1","execution_id":"e","admitted_at":1}"#;
    assert!(serde_json::from_str::<RunReport>(body).is_err());
}

mod http {
    use arkhe_core::{worker::WorkerExecutionRecord, Digest32};
    use arkhe_runtime::run_report::{router, RunEndpoint, VerifiedWorkerCommitter};
    use async_trait::async_trait;
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
    };
    use std::sync::{Arc, Mutex};
    use tower::ServiceExt;

    #[derive(Default)]
    struct Store {
        committed: Mutex<Vec<WorkerExecutionRecord>>,
        down: bool,
    }

    #[async_trait]
    impl VerifiedWorkerCommitter for Store {
        async fn commit_verified_worker(
            &self,
            worker: &WorkerExecutionRecord,
        ) -> Result<Digest32, String> {
            if self.down {
                return Err("database unavailable".into());
            }
            self.committed.lock().unwrap().push(worker.clone());
            Ok(worker.digest())
        }
    }

    const TOKEN: &str = "synthetic-token-synthetic-token-0";
    const BODY: &str = r#"{"module_id":"billing-cron","module_version":"a1b2c3d","execution_id":"billing-cron:2026-10-30T10:00Z"}"#;

    async fn post(store: Arc<Store>, auth: Option<&str>, body: &str) -> (StatusCode, String) {
        let app = router(Arc::new(RunEndpoint {
            store,
            token: TOKEN.into(),
            actor: "ops".into(),
        }));
        let mut req = Request::builder()
            .method("POST")
            .uri("/v1/runs")
            .header("content-type", "application/json");
        if let Some(auth) = auth {
            req = req.header("authorization", auth);
        }
        let res = app
            .oneshot(req.body(Body::from(body.to_owned())).unwrap())
            .await
            .unwrap();
        let status = res.status();
        let bytes = to_bytes(res.into_body(), 1 << 16).await.unwrap();
        (status, String::from_utf8(bytes.to_vec()).unwrap())
    }

    #[tokio::test]
    async fn authenticated_report_commits_the_built_wer() {
        let store = Arc::new(Store::default());
        let (status, body) = post(store.clone(), Some(&format!("Bearer {TOKEN}")), BODY).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let committed = store.committed.lock().unwrap();
        assert_eq!(committed.len(), 1);
        let json: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(json["record_hash"], committed[0].digest().to_hex());
        assert_eq!(json["module_id"], "billing-cron");
        assert_eq!(committed[0].execution_id, "billing-cron:2026-10-30T10:00Z");
    }

    #[tokio::test]
    async fn missing_or_wrong_token_commits_nothing() {
        let store = Arc::new(Store::default());
        for auth in [None, Some("Bearer wrong"), Some(TOKEN)] {
            let (status, _) = post(store.clone(), auth, BODY).await;
            assert_eq!(status, StatusCode::UNAUTHORIZED);
        }
        assert!(store.committed.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn invalid_reports_are_rejected_before_storage() {
        let store = Arc::new(Store::default());
        let auth = format!("Bearer {TOKEN}");
        let (status, body) = post(
            store.clone(),
            Some(&auth),
            &BODY.replace("billing-cron:", "billing cron:"),
        )
        .await;
        assert_eq!(
            (status, body.as_str()),
            (StatusCode::BAD_REQUEST, "invalid execution_id")
        );
        let (status, _) = post(
            store.clone(),
            Some(&auth),
            &BODY.replace('}', r#","admitted_at":1}"#),
        )
        .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert!(store.committed.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn storage_failure_is_reported_not_hidden() {
        let store = Arc::new(Store {
            down: true,
            ..Default::default()
        });
        let (status, body) = post(store, Some(&format!("Bearer {TOKEN}")), BODY).await;
        assert_eq!(
            (status, body.as_str()),
            (StatusCode::SERVICE_UNAVAILABLE, "evidence commit failed")
        );
    }
}
