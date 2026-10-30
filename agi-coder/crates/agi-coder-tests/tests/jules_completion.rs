#[allow(dead_code)]
mod support;
use agi_coder_core::*;
use agi_coder_jules::{
    worker_record::{CompletionContext, JulesWorkerRecord},
    Session,
};
fn session() -> Session {
    Session {
        name: "sessions/test".into(),
        id: "test".into(),
        state: "COMPLETED".into(),
        outputs: vec![],
    }
}
fn activities() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({"name":"sessions/test/activities/done","sessionCompleted":{},"createTime":"2026-10-22T12:00:00Z","artifacts":[{"changeSet":{"gitPatch":{"unidiffPatch":"diff --git a/a b/a\n+fixed"}}}]}),
    ]
}
fn context() -> CompletionContext {
    CompletionContext {
        operation_id: support::intent().operation_id().unwrap(),
        plan_digest: ContentHash::hash(b"plan"),
        test_artifact: ContentHash::hash(b"independent-run"),
        independent_tests: TestResults {
            passed: 2,
            failed: 0,
            skipped: 0,
        },
    }
}
#[test]
fn completion_time_comes_from_provider_event_and_record_stays_unsigned() {
    let r =
        JulesWorkerRecord::from_session(&support::intent(), &session(), &activities(), context())
            .unwrap();
    assert_eq!(r.completed_at, Timestamp(1792670400));
    assert_eq!(r.self_check, SelfCheckResult::Pass);
    assert!(r.verify().is_err());
    assert!(r.signature.is_empty());
    let mut c = context();
    c.independent_tests.failed = 1;
    let r =
        JulesWorkerRecord::from_session(&support::intent(), &session(), &activities(), c).unwrap();
    assert_eq!(r.self_check, SelfCheckResult::Fail);
}
#[test]
fn missing_ambiguous_foreign_or_invalid_completion_cannot_use_local_time() {
    for case in 0..7 {
        let mut a = activities();
        let mut c = context();
        let mut s = session();
        match case {
            0 => {
                a[0].as_object_mut().unwrap().remove("createTime");
            }
            1 => a[0]["createTime"] = serde_json::json!("invalid"),
            2 => a.push(a[0].clone()),
            3 => a[0]["name"] = serde_json::json!("sessions/other/activities/done"),
            4 => c.operation_id = ContentHash::ZERO,
            5 => s.state = "IN_PROGRESS".into(),
            _ => {
                a[0].as_object_mut().unwrap().remove("sessionCompleted");
            }
        }
        assert!(
            JulesWorkerRecord::from_session(&support::intent(), &s, &a, c).is_err(),
            "case {case}"
        );
    }
}
