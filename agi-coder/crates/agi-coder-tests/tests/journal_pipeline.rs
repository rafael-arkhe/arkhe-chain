mod support;
use agi_coder_core::*;
use agi_coder_journal::*;
use agi_coder_pipeline::{subagent::*, PipelineOrchestrator};
use support::*;
struct CountingWorker {
    count: u32,
    fail: bool,
}
impl Worker for CountingWorker {
    fn execute(&mut self, i: &WorkIntent) -> Result<WorkerExecutionRecord, String> {
        self.count += 1;
        if self.fail {
            Err("timeout after possible remote create".into())
        } else {
            Ok(record(i))
        }
    }
}
struct Counter {
    count: u32,
    fail: bool,
}
impl ProtectedExecutor for Counter {
    fn execute(&mut self, _: &agi_coder_kernel::Authorization) -> Result<Vec<u8>, String> {
        self.count += 1;
        if self.fail {
            Err("unknown outcome".into())
        } else {
            Ok(b"receipt".to_vec())
        }
    }
}
#[test]
fn replay_never_dispatches_twice() {
    let i = intent();
    let p = policy(&record(&i));
    let mut pipeline = PipelineOrchestrator::default();
    let mut w = CountingWorker {
        count: 0,
        fail: false,
    };
    let mut x = Counter {
        count: 0,
        fail: false,
    };
    let a = pipeline
        .run_stage(&i, &p, Timestamp(102), &mut w, &mut x)
        .unwrap();
    let b = pipeline
        .run_stage(&i, &p, Timestamp(103), &mut w, &mut x)
        .unwrap();
    assert_eq!(a, b);
    assert_eq!(w.count, 1);
    assert_eq!(x.count, 1);
    assert_eq!(pipeline.graph.len(), 1);
    let mut conflict = i.clone();
    conflict.parameters = serde_json::json!({"changed":true});
    assert!(pipeline
        .run_stage(&conflict, &p, Timestamp(103), &mut w, &mut x)
        .is_err());
    assert_eq!(w.count, 1);
}
#[test]
fn rejected_evidence_never_reaches_executor_or_graph() {
    let i = intent();
    let mut p = policy(&record(&i));
    p.allowed_signers.clear();
    let mut pipeline = PipelineOrchestrator::default();
    let mut w = CountingWorker {
        count: 0,
        fail: false,
    };
    let mut x = Counter {
        count: 0,
        fail: false,
    };
    assert!(pipeline
        .run_stage(&i, &p, Timestamp(102), &mut w, &mut x)
        .is_err());
    assert_eq!(x.count, 0);
    assert!(pipeline.graph.is_empty());
    assert_eq!(
        pipeline
            .journal
            .get(&i.operation_id().unwrap())
            .unwrap()
            .status,
        Status::Failed
    );
}
#[test]
fn ambiguous_effects_require_reconciliation_without_redispatch() {
    for worker_fails in [true, false] {
        let i = intent();
        let p = policy(&record(&i));
        let mut pipeline = PipelineOrchestrator::default();
        let mut w = CountingWorker {
            count: 0,
            fail: worker_fails,
        };
        let mut x = Counter {
            count: 0,
            fail: !worker_fails,
        };
        assert!(pipeline
            .run_stage(&i, &p, Timestamp(102), &mut w, &mut x)
            .is_err());
        assert!(pipeline
            .run_stage(&i, &p, Timestamp(102), &mut w, &mut x)
            .is_err());
        assert_eq!(w.count, 1);
        assert_eq!(
            pipeline
                .journal
                .get(&i.operation_id().unwrap())
                .unwrap()
                .status,
            Status::ManualReconciliationRequired
        );
    }
}
#[test]
fn same_nonce_with_altered_parameters_conflicts_and_keeps_the_original() {
    let mut journal = OperationJournal::default();
    let original = intent();
    let id = original.operation_id().unwrap();
    let digest = original.digest().unwrap();
    assert_eq!(journal.admit(&original).unwrap(), AdmissionResult::New(id));

    let mut altered = original.clone();
    altered.parameters = serde_json::json!({"goal": "different work"});
    assert_eq!(altered.request_identity, original.request_identity);
    assert_eq!(altered.operation_id().unwrap(), id);
    assert_ne!(altered.digest().unwrap(), digest);
    match journal.admit(&altered) {
        Err(JournalError::Conflict) => {}
        other => panic!("altered parameters were not rejected: {other:?}"),
    }

    let stored = journal.get(&id).unwrap();
    assert_eq!(stored.intent_digest, digest);
    assert_eq!(stored.status, Status::Pending);
    assert!(stored.response.is_none());
    assert_eq!(
        journal.admit(&original).unwrap(),
        AdmissionResult::InProgress
    );
}

#[test]
fn journal_rejects_invalid_transitions_and_actor_conflicts() {
    let mut j = OperationJournal::default();
    let i = intent();
    let id = i.operation_id().unwrap();
    assert!(j.finish(id, Status::Completed, Some(vec![]), None).is_err());
    assert_eq!(j.admit(&i).unwrap(), AdmissionResult::New(id));
    assert_eq!(j.admit(&i).unwrap(), AdmissionResult::InProgress);
    let mut changed = i.clone();
    changed.requested_by = Did("did:attacker".into());
    assert!(j.admit(&changed).is_err());
    assert!(j.finish(id, Status::Completed, None, None).is_err());
    j.finish(id, Status::Completed, Some(b"ok".to_vec()), None)
        .unwrap();
    assert!(j.finish(id, Status::Failed, None, None).is_err());
}
