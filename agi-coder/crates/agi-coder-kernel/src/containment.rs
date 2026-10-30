use crate::Policy;
use agi_coder_core::{
    ContentHash, Evidence, EvidenceStore, SelfCheckResult, Timestamp, WorkIntent,
};
#[derive(Debug, thiserror::Error)]
pub enum GateError {
    #[error("authorization denied: {0}")]
    Denied(&'static str),
    #[error(transparent)]
    Core(#[from] agi_coder_core::Error),
}
#[derive(Debug)]
pub struct Authorization {
    operation: ContentHash,
    evidence: ContentHash,
    output: ContentHash,
}
impl Authorization {
    pub fn operation(&self) -> ContentHash {
        self.operation
    }
    pub fn evidence(&self) -> ContentHash {
        self.evidence
    }
    pub fn output(&self) -> ContentHash {
        self.output
    }
}
pub struct ContainmentGate;
impl ContainmentGate {
    pub fn authorize(
        intent: &WorkIntent,
        evidence: ContentHash,
        store: &impl EvidenceStore,
        policy: &Policy,
        now: Timestamp,
    ) -> Result<Authorization, GateError> {
        let deny = GateError::Denied;
        if !policy.allowed_requesters.contains(&intent.requested_by.0)
            || !policy.allowed_operations.contains(&intent.intent_type)
        {
            return Err(deny("requester or operation is not allowed"));
        }
        let Some(Evidence::WorkerExecution(record)) = store.get(&evidence) else {
            return Err(deny("required evidence is absent"));
        };
        record.verify()?;
        if evidence != record.record_hash {
            return Err(deny("evidence store key mismatch"));
        }
        if !policy.allowed_signers.contains(&record.signer) {
            return Err(deny("signer is not trusted"));
        }
        if record.operation_id != intent.operation_id()?
            || record.intent_digest != intent.digest()?
        {
            return Err(deny("intent binding mismatch"));
        }
        if record.output != policy.expected_output {
            return Err(deny("artifact binding mismatch"));
        }
        if record.self_check != SelfCheckResult::Pass {
            return Err(deny("tests failed, were skipped, or were absent"));
        }
        let age = now
            .0
            .checked_sub(record.completed_at.0)
            .ok_or(deny("timestamp overflow"))?;
        if policy.max_age_seconds < 0 || age < 0 || age > policy.max_age_seconds {
            return Err(deny("stale or future evidence"));
        }
        Ok(Authorization {
            operation: record.operation_id,
            evidence,
            output: record.output,
        })
    }
}
