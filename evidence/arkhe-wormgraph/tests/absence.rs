use arkhe_core::{
    evidence::{EvidenceCommitter, EvidenceEnvelope, EvidenceReader},
    expectation::{Admission, ExecutionExpectation, EXPECTATION_VERSION},
    CanonicalEncode, Digest32,
};
use arkhe_wormgraph::{
    absence::{audit_and_record, AdmissionLog, ABSENCE_KIND},
    WormGraph,
};
use async_trait::async_trait;
use std::sync::Mutex;

const HOUR: u64 = 3600;
const T0: u64 = 1_790_000_000;

fn hourly() -> ExecutionExpectation {
    ExecutionExpectation {
        version: EXPECTATION_VERSION,
        expectation_id: "laravel:schedule:run".into(),
        module_id: "billing-cron".into(),
        anchor_unix: T0,
        period_secs: HOUR,
        grace_secs: 300,
        policy_digest: Digest32([7; 32]),
    }
}

/// Records the ranges it was asked for so tests can check what was read.
struct Log {
    runs: Vec<u64>,
    fail: bool,
    asked: Mutex<Vec<(u64, u64)>>,
}

impl Log {
    fn new(runs: Vec<u64>) -> Self {
        Self {
            runs,
            fail: false,
            asked: Mutex::new(vec![]),
        }
    }
}

#[async_trait]
impl AdmissionLog for Log {
    async fn admissions(&self, from: u64, until: u64) -> Result<Vec<Admission>, String> {
        self.asked.lock().unwrap().push((from, until));
        if self.fail {
            return Err("log unavailable".into());
        }
        Ok(self
            .runs
            .iter()
            .filter(|t| (from..until).contains(*t))
            .map(|&t| Admission {
                admitted_at_unix: t,
                module_id: "billing-cron".into(),
            })
            .collect())
    }
}

struct Refusing;

#[async_trait]
impl EvidenceCommitter for Refusing {
    async fn append_verified(&self, _: EvidenceEnvelope) -> Result<Digest32, String> {
        Err("must not commit".into())
    }
}

#[tokio::test]
async fn silent_window_is_committed_as_absence_evidence() {
    let e = hourly();
    let graph = WormGraph::new();
    let log = Log::new(vec![T0 + 10, T0 + 2 * HOUR + 600]);
    let out = audit_and_record(&log, &graph, &e, 0, T0 + 3 * HOUR + 300)
        .await
        .unwrap();
    assert_eq!(out.next_window, 3);
    assert_eq!(out.absences.len(), 1);
    let r = &out.absences[0];
    assert_eq!(r.window_index, 1);
    let stored = graph.get(r.object_digest()).await.unwrap().unwrap();
    assert_eq!(stored.kind, ABSENCE_KIND);
    assert_eq!(stored.causal_parents, vec![e.object_digest()]);
    assert_eq!(stored.policy_digest, Some(e.policy_digest));
    assert!(graph.get(e.object_digest()).await.unwrap().is_some());
}

#[tokio::test]
async fn resumed_audit_reads_the_previous_window_and_commits_idempotently() {
    let e = hourly();
    let graph = WormGraph::new();
    let log = Log::new(vec![]);
    let first = audit_and_record(&log, &graph, &e, 0, T0 + 2 * HOUR + 300)
        .await
        .unwrap();
    assert_eq!(first.absences.len(), 2);
    let second = audit_and_record(&log, &graph, &e, first.next_window, T0 + 3 * HOUR + 300)
        .await
        .unwrap();
    assert_eq!(second.absences.len(), 1);
    assert_eq!(second.absences[0].window_index, 2);
    assert_eq!(
        log.asked.lock().unwrap()[1],
        (T0 + HOUR, T0 + 3 * HOUR + 300)
    );
    // Re-auditing everything yields the same envelopes; the store accepts them.
    let again = audit_and_record(&log, &graph, &e, 0, T0 + 3 * HOUR + 300)
        .await
        .unwrap();
    assert_eq!(again.absences.len(), 3);
}

#[tokio::test]
async fn nothing_closed_reads_and_commits_nothing() {
    let e = hourly();
    let log = Log::new(vec![]);
    let out = audit_and_record(&log, &Refusing, &e, 0, T0 + HOUR + 299)
        .await
        .unwrap();
    assert!(out.absences.is_empty());
    assert_eq!(out.next_window, 0);
    assert!(log.asked.lock().unwrap().is_empty());
}

#[tokio::test]
async fn unreadable_log_commits_nothing() {
    let e = hourly();
    let mut log = Log::new(vec![]);
    log.fail = true;
    let err = audit_and_record(&log, &Refusing, &e, 0, T0 + 3 * HOUR + 300)
        .await
        .unwrap_err();
    assert_eq!(err, "log unavailable");
}

#[tokio::test]
async fn invalid_expectation_is_rejected_before_reading() {
    let mut e = hourly();
    e.grace_secs = HOUR;
    let log = Log::new(vec![]);
    assert!(audit_and_record(&log, &Refusing, &e, 0, T0 + 3 * HOUR)
        .await
        .is_err());
    assert!(log.asked.lock().unwrap().is_empty());
}
