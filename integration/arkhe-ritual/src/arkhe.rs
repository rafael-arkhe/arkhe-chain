//! Adapter to the existing admitted-evidence gate; no replacement WER type.
use crate::{
    crypto::{Envelope, Hash},
    protocol::{ExecutionReceipt, GatePolicy, VerifiedAnalysis, RECEIPT},
    require, Error, Result,
};
use arkhe_core::{
    evidence::{EvidenceEnvelope, EvidenceReader},
    work::WorkIntent,
    worker::WorkerExecutionRecord,
    CanonicalEncode, Digest32,
};
use arkhe_governance::{PolicyBinding, PolicyResolver};
use arkhe_kernel::{AuthorizationDecision, ContainmentGate};
use async_trait::async_trait;
use ed25519_dalek::VerifyingKey;

pub struct ArkheGate<'a, R: PolicyResolver, E: EvidenceReader> {
    pub gate: &'a ContainmentGate<R>,
    pub intent: &'a WorkIntent,
    pub worker: &'a WorkerExecutionRecord,
    pub policy: &'a PolicyBinding,
    pub evidence: &'a E,
    pub effect: &'a EffectBinding,
}
/// Trusted host mapping from the authorized WorkIntent to the exact external effect.
/// Construct from the capability executor's resolved command, never from caller claims.
pub struct EffectBinding {
    pub destination: String,
    pub payload_digest: Hash,
    pub effect_index: u32,
}
#[async_trait]
impl<R: PolicyResolver, E: EvidenceReader> GatePolicy for ArkheGate<'_, R, E> {
    async fn authorize(&self, verified: &VerifiedAnalysis) -> Result<()> {
        let r = &verified.analysis().request;
        require(
            r.operation == self.intent.operation_id().0
                && r.intent == self.intent.object_digest().0
                && r.parameters == self.intent.parameters_digest.0
                && r.policy == self.policy.policy_digest.0
                && r.input == self.worker.input_digest.0
                && verified.analysis().output == self.worker.output_digest.0
                && r.destination == self.effect.destination
                && r.payload_digest == self.effect.payload_digest
                && r.effect_index == self.effect.effect_index,
            "Arkhe intent/worker binding mismatch",
        )?;
        match self
            .gate
            .authorize_admitted(self.intent, self.worker, self.policy, self.evidence)
            .await
        {
            AuthorizationDecision::Allow { .. } => Ok(()),
            AuthorizationDecision::Reject { .. } => Err(Error::Rejected("Arkhe gate rejected")),
        }
    }
}
/// Prepare the exact canonical record for the existing WormGraph admission path.
/// This function is NOT an inclusion proof. Use the host's checkpoint/anchor API
/// after append, and validate SignedCheckpoint against independently configured trust.
pub fn audit_envelope(
    signed: &Envelope,
    audit_key: &VerifyingKey,
    policy: Hash,
) -> Result<EvidenceEnvelope> {
    let receipt: ExecutionReceipt = signed.open(RECEIPT, audit_key)?;
    require(receipt.policy == policy, "audit policy mismatch")?;
    let record_hash = Digest32(receipt.commitment()?);
    Ok(EvidenceEnvelope {
        record_hash,
        kind: "RitualExecutionReceiptV1".into(),
        subject: Digest32(receipt.effect),
        payload_digest: record_hash,
        policy_digest: Some(Digest32(policy)),
        causal_parents: vec![Digest32(receipt.analysis), Digest32(receipt.authorization)],
    })
}
