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
