use arkhe_core::{
    expectation::{ExecutionExpectation, ExpectationError, EXPECTATION_VERSION},
    worker::WorkerExecutionRecord,
    CanonicalEncode, Digest32,
};

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

fn wer(module: &str, id: &str) -> WorkerExecutionRecord {
    WorkerExecutionRecord {
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
    }
}

#[test]
fn every_window_with_a_run_yields_no_absence() {
    let e = hourly();
    let runs: Vec<_> = (0..3)
        .map(|k| wer("billing-cron", &format!("r{k}")))
        .collect();
    let admitted: Vec<_> = runs
        .iter()
        .enumerate()
        .map(|(k, w)| (T0 + k as u64 * HOUR + 10, w))
        .collect();
    let now = T0 + 3 * HOUR + 300;
    assert_eq!(e.closed_windows(now), 3);
    assert!(e.audit(0, now, &admitted).unwrap().is_empty());
}

#[test]
fn silent_window_becomes_an_absence_record() {
    let e = hourly();
    let (a, c) = (wer("billing-cron", "a"), wer("billing-cron", "c"));
    // Window 1 has no run: the cron died silently.
    let admitted = [(T0 + 5, &a), (T0 + 2 * HOUR + 600, &c)];
    let absences = e.audit(0, T0 + 3 * HOUR + 300, &admitted).unwrap();
    assert_eq!(absences.len(), 1);
    let r = &absences[0];
    assert_eq!(r.window_index, 1);
    assert_eq!(
        (r.window_start_unix, r.window_end_unix),
        (T0 + HOUR, T0 + 2 * HOUR)
    );
    assert_eq!(r.expectation_digest, e.object_digest());
    assert_eq!(r.module_id, "billing-cron");
}

#[test]
fn open_window_is_never_judged() {
    let e = hourly();
    // Window 0 ended but its grace period has not elapsed.
    assert_eq!(e.closed_windows(T0 + HOUR + 299), 0);
    assert!(e.audit(0, T0 + HOUR + 299, &[]).unwrap().is_empty());
    assert_eq!(e.audit(0, T0 + HOUR + 300, &[]).unwrap().len(), 1);
    // Before the anchor nothing is closed.
    assert!(e.audit(0, T0 - 1, &[]).unwrap().is_empty());
}

#[test]
fn late_run_within_grace_satisfies_the_window() {
    let e = hourly();
    let late = wer("billing-cron", "late");
    let admitted = [(T0 + HOUR + 299, &late)];
    assert!(e.audit(0, T0 + HOUR + 300, &admitted).unwrap().is_empty());
    let too_late = [(T0 + HOUR + 300, &late)];
    assert_eq!(e.audit(0, T0 + HOUR + 300, &too_late).unwrap().len(), 1);
}

#[test]
fn one_run_in_the_grace_overlap_cannot_satisfy_two_windows() {
    let e = hourly();
    let a = wer("billing-cron", "a");
    let b = wer("billing-cron", "b");
    // Window 0 is silent; the only later run sits in window 0's grace period,
    // which is also the start of window 1. It is credited to one window only.
    let one = [(T0 + HOUR + 5, &a)];
    let absences = e.audit(0, T0 + 2 * HOUR + 300, &one).unwrap();
    assert_eq!(absences.len(), 1);
    assert_eq!(absences[0].window_index, 1);
    // A second run in window 1 means both windows ran.
    let two = [(T0 + HOUR + 5, &a), (T0 + HOUR + 1800, &b)];
    assert!(e.audit(0, T0 + 2 * HOUR + 300, &two).unwrap().is_empty());
    // If window 0 ran on time, a run at the start of window 1 is simply window 1's.
    let on_time = [(T0 + 10, &b), (T0 + HOUR + 5, &a)];
    assert!(e
        .audit(0, T0 + 2 * HOUR + 300, &on_time)
        .unwrap()
        .is_empty());
}

#[test]
fn other_modules_do_not_satisfy_the_expectation() {
    let e = hourly();
    let other = wer("mailer", "m");
    let admitted = [(T0 + 10, &other)];
    assert_eq!(e.audit(0, T0 + HOUR + 300, &admitted).unwrap().len(), 1);
}

#[test]
fn reaudit_is_idempotent_and_resumable() {
    let e = hourly();
    let now = T0 + 4 * HOUR + 300;
    let first = e.audit(0, now, &[]).unwrap();
    let again = e.audit(0, now, &[]).unwrap();
    let digests = |v: &[_]| -> Vec<Digest32> {
        v.iter()
            .map(|r: &arkhe_core::expectation::AbsenceRecord| r.object_digest())
            .collect()
    };
    assert_eq!(digests(&first), digests(&again));
    let resumed = e.audit(2, now, &[]).unwrap();
    assert_eq!(digests(&resumed), digests(&first[2..]));
}

type Mutation = fn(&mut ExecutionExpectation);

#[test]
fn invalid_expectations_are_rejected() {
    let cases: [(Mutation, &str); 5] = [
        (|e| e.version = 2, "unsupported version"),
        (|e| e.period_secs = 0, "period_secs"),
        (
            |e| e.grace_secs = HOUR,
            "grace_secs must be below period_secs",
        ),
        (|e| e.module_id.clear(), "module_id"),
        (|e| e.expectation_id = "bad id".into(), "expectation_id"),
    ];
    for (mutate, msg) in cases {
        let mut e = hourly();
        mutate(&mut e);
        assert_eq!(
            e.audit(0, T0 + 10 * HOUR, &[]),
            Err(ExpectationError::Schema(msg))
        );
    }
}

#[test]
fn unbounded_backlog_fails_closed() {
    let mut e = hourly();
    e.period_secs = 1;
    e.grace_secs = 0;
    assert_eq!(
        e.audit(0, T0 + 20_000, &[]),
        Err(ExpectationError::TooManyWindows)
    );
    assert_eq!(e.audit(15_000, T0 + 20_000, &[]).unwrap().len(), 5_000);
}

#[test]
fn digests_are_domain_separated_and_field_sensitive() {
    let e = hourly();
    let r = &e.audit(0, T0 + HOUR + 300, &[]).unwrap()[0];
    assert_ne!(e.object_digest(), r.object_digest());
    let mut changed = hourly();
    changed.grace_secs = 301;
    assert_ne!(e.object_digest(), changed.object_digest());
}
