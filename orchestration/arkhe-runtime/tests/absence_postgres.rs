//! End to end on a live database: a run report is admitted through /v1/runs,
//! the auditor reads it back by database time, and the one silent window is
//! committed and verifies offline.
use arkhe_core::evidence::EvidenceReader;
use arkhe_runtime::run_report::{router, RunEndpoint};
use arkhe_verify_core::absence::{verify, ExpectationSpec};
use arkhe_wormgraph::{
    absence::{audit_and_record, AdmissionLog},
    postgres::PgWormGraph,
};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tower::ServiceExt;

#[tokio::test]
#[ignore = "requires ARKHE_TEST_RUNTIME_DATABASE_URL with migrated storage roles"]
async fn reported_run_satisfies_its_window_and_silence_is_recorded() {
    let url = std::env::var("ARKHE_TEST_RUNTIME_DATABASE_URL")
        .expect("ARKHE_TEST_RUNTIME_DATABASE_URL must point to a migrated test database");
    let tenant = format!("tenant-absence-e2e-{}", std::process::id());
    let store = Arc::new(PgWormGraph::connect(&url, &tenant).await.unwrap());
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let token = "synthetic-token-synthetic-token-0";
    let app = router(Arc::new(RunEndpoint {
        store: store.clone(),
        token: token.into(),
        actor: "ops".into(),
    }));
    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/runs")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::from(
                    r#"{"module_id":"billing-cron","module_version":"e2e","execution_id":"billing-cron:e2e"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // Anchor on the time the database admitted the run, not the test clock.
    let admitted = store.admissions(now - 5, now + 60).await.unwrap();
    assert_eq!(admitted.len(), 1);
    let at = admitted[0].admitted_at_unix;
    // Ten-second windows: the one holding the run is satisfied, the one before
    // it is silent. Audit once both have closed (grace 0).
    let period = 10;
    let current = at - at % period;
    let spec = ExpectationSpec {
        version: 1,
        expectation_id: format!("e2e:{tenant}"),
        module_id: "billing-cron".into(),
        anchor_unix: current - period,
        period_secs: period,
        grace_secs: 0,
        policy_digest: "00".repeat(32),
    };
    let expectation = spec.expectation().unwrap();
    let audit_at = current + period + 1;
    let outcome = audit_and_record(&*store, &*store, &expectation, 0, audit_at)
        .await
        .unwrap();
    assert_eq!(outcome.next_window, 2);
    let windows: Vec<_> = outcome.absences.iter().map(|r| r.window_index).collect();
    assert_eq!(windows, [0], "only the window before the run is silent");

    use arkhe_core::CanonicalEncode;
    let hash = outcome.absences[0].object_digest();
    let stored = store.get(hash).await.unwrap().expect("absence committed");
    assert_eq!(stored.causal_parents, vec![expectation.object_digest()]);
    let verdict = verify(&spec, 0, &hash.to_hex(), audit_at).unwrap();
    assert_eq!(verdict.status, "VERIFIED");
}
