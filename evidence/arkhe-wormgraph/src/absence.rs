//! Records silent windows of an `ExecutionExpectation` as evidence. Admission
//! times come from the store (`work_objects.created_at` for Postgres), never
//! from the worker. Absence records are not stored as objects: each one is
//! regenerable from the expectation and its window index, so an envelope
//! committing its digest is enough for offline verification.
use arkhe_core::{
    evidence::{EvidenceCommitter, EvidenceEnvelope},
    expectation::{AbsenceRecord, Admission, ExecutionExpectation},
    CanonicalEncode, Digest32,
};
use async_trait::async_trait;

pub const EXPECTATION_KIND: &str = "ExecutionExpectation";
pub const ABSENCE_KIND: &str = "AbsenceRecord";
/// An audit that would read more admissions than this fails closed: a
/// truncated log would turn ordinary runs into false absences.
pub const MAX_ADMISSIONS_PER_AUDIT: usize = 100_000;

#[async_trait]
pub trait AdmissionLog: Send + Sync {
    /// Every WER admitted in `[from_unix, until_unix)`, by the log's own clock.
    /// Must return `Err` rather than a partial list.
    async fn admissions(&self, from_unix: u64, until_unix: u64) -> Result<Vec<Admission>, String>;
}

pub fn expectation_envelope(e: &ExecutionExpectation) -> EvidenceEnvelope {
    let digest = e.object_digest();
    EvidenceEnvelope {
        record_hash: digest,
        kind: EXPECTATION_KIND.into(),
        subject: digest,
        payload_digest: digest,
        policy_digest: Some(e.policy_digest),
        causal_parents: vec![],
    }
}

pub fn absence_envelope(e: &ExecutionExpectation, r: &AbsenceRecord) -> EvidenceEnvelope {
    let digest = r.object_digest();
    EvidenceEnvelope {
        record_hash: digest,
        kind: ABSENCE_KIND.into(),
        subject: r.expectation_digest,
        payload_digest: digest,
        policy_digest: Some(e.policy_digest),
        causal_parents: vec![r.expectation_digest],
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditOutcome {
    pub expectation_digest: Digest32,
    pub absences: Vec<AbsenceRecord>,
    /// Pass as `from_window` next time. Re-auditing earlier windows is
    /// harmless: identical records commit idempotently.
    pub next_window: u64,
}

/// Audit closed windows from `from_window` and commit the expectation and one
/// envelope per silent window. Commits nothing if reading the log fails.
pub async fn audit_and_record<L, C>(
    log: &L,
    committer: &C,
    expectation: &ExecutionExpectation,
    from_window: u64,
    now_unix: u64,
) -> Result<AuditOutcome, String>
where
    L: AdmissionLog + ?Sized,
    C: EvidenceCommitter + ?Sized,
{
    expectation.validate().map_err(|e| e.to_string())?;
    let expectation_digest = expectation.object_digest();
    let next_window = expectation.closed_windows(now_unix).max(from_window);
    let Some((from, until)) = expectation
        .admission_range(from_window, now_unix)
        .map_err(|e| e.to_string())?
    else {
        return Ok(AuditOutcome {
            expectation_digest,
            absences: vec![],
            next_window,
        });
    };
    let admitted = log.admissions(from, until).await?;
    if admitted.len() > MAX_ADMISSIONS_PER_AUDIT {
        return Err("admission log exceeds the per-audit bound".into());
    }
    let absences = expectation
        .audit(from_window, now_unix, &admitted)
        .map_err(|e| e.to_string())?;
    committer
        .append_verified(expectation_envelope(expectation))
        .await?;
    for r in &absences {
        committer
            .append_verified(absence_envelope(expectation, r))
            .await?;
    }
    Ok(AuditOutcome {
        expectation_digest,
        absences,
        next_window,
    })
}
