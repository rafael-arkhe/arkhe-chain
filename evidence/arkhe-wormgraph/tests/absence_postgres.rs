use arkhe_core::{worker::WorkerExecutionRecord, Digest32};
use arkhe_wormgraph::{absence::AdmissionLog, postgres::PgWormGraph};
use std::time::{SystemTime, UNIX_EPOCH};

#[tokio::test]
#[ignore = "requires ARKHE_TEST_RUNTIME_DATABASE_URL with migrated storage roles"]
async fn postgres_admissions_use_database_time_and_module_id() {
    let url = std::env::var("ARKHE_TEST_RUNTIME_DATABASE_URL")
        .expect("ARKHE_TEST_RUNTIME_DATABASE_URL must point to a migrated test database");
    let tenant = format!("tenant-absence-{}", std::process::id());
    let graph = PgWormGraph::connect(&url, &tenant).await.unwrap();
    let before = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    for (module, id) in [("billing-cron", "a"), ("mailer", "b")] {
        graph
            .commit_verified_worker(&WorkerExecutionRecord {
                classification: None,
                operation: None,
                module_id: module.into(),
                module_version: "1.0.0".into(),
                input_digest: Digest32::ZERO,
                output_digest: Digest32::ZERO,
                evidence_refs: vec![],
                confidence_bps: None,
                uncertainty_note: None,
                execution_id: id.into(),
            })
            .await
            .unwrap();
    }
    let after = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 1;
    let mut admitted = graph.admissions(before - 1, after + 1).await.unwrap();
    admitted.sort_by(|a, b| a.module_id.cmp(&b.module_id));
    let modules: Vec<_> = admitted.iter().map(|a| a.module_id.as_str()).collect();
    assert_eq!(modules, ["billing-cron", "mailer"]);
    assert!(admitted
        .iter()
        .all(|a| (before - 1..=after).contains(&a.admitted_at_unix)));
    assert!(graph.admissions(0, before - 1).await.unwrap().is_empty());
}
