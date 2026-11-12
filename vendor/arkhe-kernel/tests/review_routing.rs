//! Public-entry regression for review routing. This resolver deliberately allows
//! the operation while independently requiring routing, as the public trait permits.
use arkhe_core::{
    evidence::{EvidenceEnvelope, EvidenceReader},
    review::{ReviewDecision, ReviewVerdict},
    work::{ContextEntry, ContextKind, RequestIdentity, WorkIntent, WorkIntentType},
    worker::{CognitiveOperation, WorkerExecutionRecord},
    Digest32,
};
use arkhe_governance::{EvidenceKindRequirement, PolicyBinding, PolicyResolver, PolicyVerdict};
use arkhe_kernel::{AuthorizationDecision, ContainmentGate};
use async_trait::async_trait;

struct ReviewPolicy {
    routing_required: bool,
}

impl PolicyResolver for ReviewPolicy {
    fn resolve(&self, _: &WorkIntent, _: &PolicyBinding) -> PolicyVerdict {
        PolicyVerdict::Allow
    }

    fn review_routing_required(&self, _: &WorkIntent, _: &PolicyBinding) -> bool {
        self.routing_required
    }

    fn automatic_review_approved(&self, _: &WorkIntent, _: &PolicyBinding) -> bool {
        true
    }

    fn required_worker_evidence(
        &self,
        _: &WorkIntent,
        _: &PolicyBinding,
    ) -> Option<EvidenceKindRequirement> {
        Some(EvidenceKindRequirement {
            allowed_modules: vec!["review-routing-test".into()],
            allowed_operations: vec![CognitiveOperation::Analyze],
        })
    }
}

struct AdmittedAnalysis(EvidenceEnvelope);

#[async_trait]
impl EvidenceReader for AdmittedAnalysis {
    async fn get(&self, hash: Digest32) -> Result<Option<EvidenceEnvelope>, String> {
        Ok((hash == self.0.record_hash).then(|| self.0.clone()))
    }
}

fn fixture(kind: WorkIntentType) -> (WorkIntent, WorkerExecutionRecord, PolicyBinding, AdmittedAnalysis) {
    let source = Digest32::blake3(b"test:source", b"source");
    let parameters = Digest32::blake3(b"test:parameters", b"draft");
    let worker = WorkerExecutionRecord {
        classification: None,
        operation: Some(CognitiveOperation::Analyze),
        module_id: "review-routing-test".into(),
        module_version: "1".into(),
        input_digest: source,
        output_digest: parameters,
        evidence_refs: vec![source],
        confidence_bps: None,
        uncertainty_note: None,
        execution_id: "review-routing-regression".into(),
    };
    let hash = worker.digest();
    let policy = PolicyBinding {
        policy_id: "review-routing-test".into(),
        version: 1,
        policy_digest: Digest32::blake3(b"test:policy", b"review"),
    };
    let intent = WorkIntent {
        requested_by: "requester".into(),
        intent_type: kind,
        target: Digest32::blake3(b"test:target", b"document"),
        parameters_digest: parameters,
        context: vec![
            ContextEntry { kind: ContextKind::SourceReport, hash: source },
            ContextEntry { kind: ContextKind::AnalysisRecord, hash },
        ],
        context_refs: vec![],
        request_identity: RequestIdentity::new(b"review-routing-regression"),
        claimed_created_at: 0,
    };
    let evidence = AdmittedAnalysis(EvidenceEnvelope {
        record_hash: hash,
        kind: "WorkerExecutionRecord".into(),
        subject: source,
        payload_digest: hash,
        policy_digest: None,
        causal_parents: vec![source],
    });
    (intent, worker, policy, evidence)
}

fn unprotected_kinds() -> [WorkIntentType; 3] {
    [WorkIntentType::DraftDocument, WorkIntentType::QueryKnowledgeBase, WorkIntentType::Simulate]
}

fn assert_routing_rejected(decision: AuthorizationDecision) {
    match decision {
        AuthorizationDecision::Reject { reason } => assert_eq!(reason, "policy requires review routing"),
        AuthorizationDecision::Allow { .. } => panic!("required review routing was bypassed: received Allow"),
    }
}

#[test]
fn simple_authorization_rejects_required_routing() {
    let gate = ContainmentGate::new(ReviewPolicy { routing_required: true });
    for kind in unprotected_kinds() {
        let (intent, worker, policy, _) = fixture(kind);
        // Neither omitting nor supplying an analysis record can bypass routing.
        assert_routing_rejected(gate.authorize(&intent, None, &policy));
        assert_routing_rejected(gate.authorize(&intent, Some(&worker), &policy));
    }
}

#[test]
fn simple_authorization_preserves_allow_without_required_routing() {
    let gate = ContainmentGate::new(ReviewPolicy { routing_required: false });
    for kind in unprotected_kinds() {
        let (intent, worker, policy, _) = fixture(kind);
        for decision in [
            gate.authorize(&intent, None, &policy),
            gate.authorize(&intent, Some(&worker), &policy),
        ] {
            assert!(matches!(decision, AuthorizationDecision::Allow { .. }), "{decision:?}");
        }
    }
}

#[tokio::test]
async fn admitted_entry_rejects_required_routing_with_valid_analysis() {
    let (intent, worker, policy, evidence) = fixture(WorkIntentType::DraftDocument);
    let gate = ContainmentGate::new(ReviewPolicy { routing_required: true });
    assert_routing_rejected(gate.authorize_admitted(&intent, &worker, &policy, &evidence).await);
    // Control: the same admitted fixture is sufficient when routing is optional.
    let gate = ContainmentGate::new(ReviewPolicy { routing_required: false });
    assert!(matches!(
        gate.authorize_admitted(&intent, &worker, &policy, &evidence).await,
        AuthorizationDecision::Allow { .. }
    ));
}

#[tokio::test]
async fn routed_entry_preserves_governance_approved_auto_accept() {
    let (mut intent, worker, policy, evidence) = fixture(WorkIntentType::DraftDocument);
    let gate = ContainmentGate::new(ReviewPolicy { routing_required: true });
    let route = ReviewDecision {
        verdict: ReviewVerdict::AutoAccept,
        reasons: vec![],
        review_policy_digest: Digest32::blake3(b"test:route-policy", b"automatic"),
    };
    intent.context.push(ContextEntry { kind: ContextKind::ReviewDecision, hash: route.digest() });
    assert!(matches!(
        gate.authorize_routed_admitted(&intent, &worker, &policy, &evidence, &route, None, 0).await,
        AuthorizationDecision::Allow { .. }
    ));
}
