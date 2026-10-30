use arkhe_core::{
    evidence::{EvidenceEnvelope, EvidenceReader},
    work::*,
    worker::*,
    CanonicalEncode, Digest32,
};
use arkhe_governance::{EvidenceKindRequirement, PolicyBinding, PolicyResolver, PolicyVerdict};
use arkhe_kernel::ContainmentGate;
use arkhe_ritual::{
    arkhe::{ArkheGate, EffectBinding},
    crypto::*,
    protocol::*,
};
use async_trait::async_trait;
use ed25519_dalek::SigningKey;
use uuid::Uuid;
struct Resolver(bool);
impl PolicyResolver for Resolver {
    fn resolve(&self, _: &WorkIntent, _: &PolicyBinding) -> PolicyVerdict {
        if self.0 {
            PolicyVerdict::Allow
        } else {
            PolicyVerdict::Deny("operation forbidden".into())
        }
    }
    fn required_worker_evidence(
        &self,
        _: &WorkIntent,
        _: &PolicyBinding,
    ) -> Option<EvidenceKindRequirement> {
        Some(EvidenceKindRequirement {
            allowed_modules: vec!["test".into()],
            allowed_operations: vec![CognitiveOperation::Analyze],
        })
    }
}
struct Reader(EvidenceEnvelope);
#[async_trait]
impl EvidenceReader for Reader {
    async fn get(&self, hash: Digest32) -> std::result::Result<Option<EvidenceEnvelope>, String> {
        Ok((self.0.record_hash == hash).then(|| self.0.clone()))
    }
}
#[tokio::test]
async fn actual_containment_gate_evaluates_policy_and_effect_mapping() {
    let worker = WorkerExecutionRecord {
        classification: None,
        operation: Some(CognitiveOperation::Analyze),
        module_id: "test".into(),
        module_version: "1".into(),
        input_digest: Digest32([1; 32]),
        output_digest: Digest32([2; 32]),
        evidence_refs: vec![],
        confidence_bps: None,
        uncertainty_note: None,
        execution_id: "test".into(),
    };
    let intent = WorkIntent {
        requested_by: "operator".into(),
        intent_type: WorkIntentType::ApproveExpense,
        target: Digest32([3; 32]),
        parameters_digest: worker.output_digest,
        context: vec![
            ContextEntry {
                kind: ContextKind::SourceReport,
                hash: worker.input_digest,
            },
            ContextEntry {
                kind: ContextKind::AnalysisRecord,
                hash: worker.digest(),
            },
        ],
        context_refs: vec![],
        request_identity: RequestIdentity::new(b"ritual-action"),
        claimed_created_at: 0,
    };
    let policy = PolicyBinding {
        policy_id: "test".into(),
        version: 1,
        policy_digest: Digest32([4; 32]),
    };
    let reader = Reader(EvidenceEnvelope {
        record_hash: worker.digest(),
        kind: "WorkerExecutionRecord".into(),
        subject: worker.input_digest,
        payload_digest: worker.digest(),
        policy_digest: Some(policy.policy_digest),
        causal_parents: vec![],
    });
    let payload = b"resolved host command";
    let request = Request {
        tenant: Uuid::new_v4(),
        operation: intent.operation_id().0,
        intent: intent.object_digest().0,
        parameters: intent.parameters_digest.0,
        input: worker.input_digest.0,
        policy: policy.policy_digest.0,
        effect_index: 0,
        destination: "trusted-capability".into(),
        payload_digest: hash(b"AKG:RITUAL:PAYLOAD:v1\0", payload),
    };
    let challenge = Challenge {
        id: Uuid::new_v4(),
        tenant: request.tenant,
        nonce: [5; 32],
        request: request.commitment().unwrap(),
        profile: PROFILE.into(),
        expires: 300,
    };
    let app = SigningKey::from_bytes(&[6; 32]);
    let vendor = SigningKey::from_bytes(&[7; 32]);
    let platform = Envelope::sign(
        &PlatformClaim {
            profile: PROFILE.into(),
            measurement: [8; 32],
            instance: [9; 32],
            app_key: app.verifying_key().to_bytes(),
            challenge: challenge.id,
            nonce: challenge.nonce,
            tenant: request.tenant,
            request: challenge.request,
            expires: 300,
        },
        PLATFORM,
        &vendor,
    )
    .unwrap();
    let statement = Envelope::sign(
        &Analysis {
            request: request.clone(),
            challenge: challenge.id,
            nonce: challenge.nonce,
            profile: PROFILE.into(),
            attestation: digest(b"AKG:RITUAL:PLATFORM-ENVELOPE:v1\0", &platform).unwrap(),
            output: worker.output_digest.0,
        },
        ANALYSIS,
        &app,
    )
    .unwrap();
    let verifier = MockPlatformVerifier::new(vendor.verifying_key(), [[8; 32]], true);
    let verified = verifier
        .verify(
            &AnalysisBundle {
                platform,
                statement,
            },
            &challenge,
            &request,
            payload,
            0,
        )
        .unwrap();
    let binding = EffectBinding {
        destination: request.destination.clone(),
        payload_digest: request.payload_digest,
        effect_index: 0,
    };
    let allow = ContainmentGate::new(Resolver(true));
    let deny = ContainmentGate::new(Resolver(false));
    let adapter = ArkheGate {
        gate: &allow,
        intent: &intent,
        worker: &worker,
        policy: &policy,
        evidence: &reader,
        effect: &binding,
    };
    assert!(adapter.authorize(&verified).await.is_ok());
    let adapter = ArkheGate {
        gate: &deny,
        intent: &intent,
        worker: &worker,
        policy: &policy,
        evidence: &reader,
        effect: &binding,
    };
    assert!(adapter.authorize(&verified).await.is_err());
    let wrong = EffectBinding {
        destination: "other".into(),
        payload_digest: request.payload_digest,
        effect_index: 0,
    };
    let adapter = ArkheGate {
        gate: &allow,
        intent: &intent,
        worker: &worker,
        policy: &policy,
        evidence: &reader,
        effect: &wrong,
    };
    assert!(adapter.authorize(&verified).await.is_err());
}
