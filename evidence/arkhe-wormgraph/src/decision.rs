//! Anchors DecisionVerdicts. What is recorded is the verdict, never a bare
//! Allow/Reject, so the log keeps whether a rejection was a rule's decision
//! or the absence or failure of policy. The verdict's subject is not linked as
//! a causal parent yet: SecurityEvent objects are not stored (F2 schema step).
use arkhe_core::{
    decision::DecisionVerdict,
    evidence::{EvidenceCommitter, EvidenceEnvelope},
    CanonicalEncode, Digest32,
};

pub const VERDICT_KIND: &str = "DecisionVerdict";

pub fn verdict_envelope(v: &DecisionVerdict) -> EvidenceEnvelope {
    let digest = v.object_digest();
    EvidenceEnvelope {
        record_hash: digest,
        kind: VERDICT_KIND.into(),
        subject: v.subject,
        payload_digest: digest,
        policy_digest: v.policy_digest,
        causal_parents: vec![],
    }
}

/// Re-validates before committing: an inconsistent verdict is never recorded.
pub async fn record_verdict<C>(committer: &C, v: &DecisionVerdict) -> Result<Digest32, String>
where
    C: EvidenceCommitter + ?Sized,
{
    v.validate().map_err(|e| e.to_string())?;
    committer.append_verified(verdict_envelope(v)).await
}
