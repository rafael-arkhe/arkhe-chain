use arkhe_core::{
    work::{WorkIntent, WorkIntentType},
    worker::WorkerExecutionRecord,
    Digest32,
};
use arkhe_governance::{PolicyBinding, PolicyResolver, PolicyVerdict};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Classification {
    Protected,
    Unprotected,
}

pub fn classify(t: &WorkIntentType) -> Classification {
    use WorkIntentType::*;
    match t {
        DraftDocument | QueryKnowledgeBase | Simulate => Classification::Unprotected,
        _ => Classification::Protected,
    }
}

#[derive(Debug, Clone)]
pub enum AuthorizationDecision {
    Allow { authorization_ref: Digest32 },
    Reject { reason: String },
}

pub struct ContainmentGate<R: PolicyResolver> {
    resolver: R,
    emergency_stop: bool,
}

impl<R: PolicyResolver> ContainmentGate<R> {
    pub fn new(resolver: R) -> Self {
        Self {
            resolver,
            emergency_stop: false,
        }
    }

    pub fn set_emergency_stop(&mut self, enabled: bool) {
        self.emergency_stop = enabled;
    }
    /// Read-only governance signal for escalation; it never grants authorization.
    pub fn policy_verdict(&self, intent: &WorkIntent, policy: &PolicyBinding) -> PolicyVerdict {
        self.resolver.resolve(intent, policy)
    }

    pub fn authorize(
        &self,
        intent: &WorkIntent,
        worker_record: Option<&WorkerExecutionRecord>,
        policy: &PolicyBinding,
    ) -> AuthorizationDecision {
        if matches!(
            intent.intent_type,
            WorkIntentType::TriageReport
                | WorkIntentType::AgentRegistration
                | WorkIntentType::CommunityJoin
                | WorkIntentType::CommunityPost
        ) {
            return AuthorizationDecision::Reject {
                reason: "integration requires admitted evidence lookup".into(),
            };
        }
        self.authorize_checked(intent, worker_record, policy)
    }

    pub async fn authorize_admitted<E: arkhe_core::evidence::EvidenceReader>(
        &self,
        intent: &WorkIntent,
        worker: &WorkerExecutionRecord,
        policy: &PolicyBinding,
        evidence: &E,
    ) -> AuthorizationDecision {
        if self.resolver.review_routing_required(intent, policy) {
            return AuthorizationDecision::Reject {
                reason: "policy requires review routing".into(),
            };
        }
        self.authorize_admitted_inner(intent, worker, policy, evidence)
            .await
    }

    /// Routing never overrides the existing admission and governance checks.
    #[allow(clippy::too_many_arguments)]
    pub async fn authorize_routed_admitted<E: arkhe_core::evidence::EvidenceReader>(
        &self,
        intent: &WorkIntent,
        worker: &WorkerExecutionRecord,
        policy: &PolicyBinding,
        evidence: &E,
        decision: &arkhe_core::review::ReviewDecision,
        human: Option<&arkhe_core::review::HumanReviewEvidence>,
        now: i64,
    ) -> AuthorizationDecision {
        use arkhe_core::{
            review::{HumanVerdict, ReviewVerdict},
            worker::CognitiveOperation,
        };
        let reject = |reason: &str| AuthorizationDecision::Reject {
            reason: reason.into(),
        };
        if decision.verdict == ReviewVerdict::AutoReject {
            return reject("review router rejected proposal");
        }
        if decision.verdict == ReviewVerdict::AutoAccept
            && self.resolver.review_routing_required(intent, policy)
            && !self.resolver.automatic_review_approved(intent, policy)
        {
            return reject("automatic review routing not approved by governance");
        }
        let mut routes = intent
            .context
            .iter()
            .filter(|e| e.kind == arkhe_core::work::ContextKind::ReviewDecision);
        if routes.next().map(|e| e.hash) != Some(decision.digest()) || routes.next().is_some() {
            return reject("missing or ambiguous review route binding");
        }
        if decision.verdict == ReviewVerdict::ReviewRequired {
            let Some(human) = human else {
                return reject("human review required");
            };
            let r = &human.review;
            let w = &human.attestation;
            let h = w.digest();
            if now < 0
                || r.verdict != HumanVerdict::Approve
                || r.reviewed_at < 0
                || r.reviewed_at > now
                || r.expires_at <= now
                || r.reviewer.trim().is_empty()
                || r.requested_by != intent.requested_by
                || r.operation_id != intent.operation_id()
                || r.parameters_digest != intent.parameters_digest
                || r.analysis_digest != worker.digest()
                || r.policy_digest != policy.policy_digest
                || r.routing_digest != decision.digest()
                || w.input_digest != worker.digest()
                || w.output_digest != r.digest()
                || !w.evidence_refs.contains(&worker.digest())
                || w.operation != Some(CognitiveOperation::Decide)
                || !self
                    .resolver
                    .human_review_modules(intent, policy)
                    .contains(&w.module_id)
            {
                return reject("invalid, stale or unauthorized human review");
            }
            let mut refs = intent
                .context
                .iter()
                .filter(|e| e.kind == arkhe_core::work::ContextKind::HumanReview);
            if refs.next().map(|e| e.hash) != Some(h) || refs.next().is_some() {
                return reject("missing or ambiguous human review context");
            }
            match evidence.get(h).await {
                Ok(Some(e))
                    if e.record_hash == h
                        && e.payload_digest == h
                        && e.kind == "WorkerExecutionRecord"
                        && e.subject == worker.digest() =>
                {
                    ()
                }
                _ => return reject("human review attestation not admitted"),
            }
        }
        self.authorize_admitted_inner(intent, worker, policy, evidence)
            .await
    }

    async fn authorize_admitted_inner<E: arkhe_core::evidence::EvidenceReader>(
        &self,
        intent: &WorkIntent,
        worker: &WorkerExecutionRecord,
        policy: &PolicyBinding,
        evidence: &E,
    ) -> AuthorizationDecision {
        let reject = |reason: &str| AuthorizationDecision::Reject {
            reason: reason.into(),
        };
        if self.emergency_stop {
            return reject("emergency stop");
        }
        let hash = match intent.analysis_record() {
            Ok(h) => h,
            Err(e) => return reject(e),
        };
        let envelope = match evidence.get(hash).await {
            Ok(Some(e)) => e,
            _ => return reject("missing admitted analysis evidence"),
        };
        let mut sources = intent
            .context
            .iter()
            .filter(|e| e.kind == arkhe_core::work::ContextKind::SourceReport);
        let source = match sources.next() {
            Some(e) => e.hash,
            None => return reject("missing source report"),
        };
        if sources.next().is_some() {
            return reject("ambiguous source report");
        }
        if worker.digest() != hash
            || envelope.record_hash != hash
            || envelope.kind != "WorkerExecutionRecord"
            || envelope.payload_digest != hash
            || envelope.subject != source
            || worker.input_digest != source
            || worker.output_digest != intent.parameters_digest
        {
            return reject("analysis evidence does not bind this proposal");
        }
        let requirement = match self.resolver.required_worker_evidence(intent, policy) {
            Some(r) => r,
            None => return reject("missing worker evidence policy"),
        };
        if !requirement.allowed_modules.contains(&worker.module_id) {
            return reject("module not allowed");
        }
        if !worker
            .operation
            .is_some_and(|op| requirement.allowed_operations.contains(&op))
        {
            return reject("operation not allowed");
        }
        if let Some(expected_policy) = self.resolver.required_classification_policy(intent, policy)
        {
            let Some(binding) = worker.classification else {
                return reject("missing typed classification binding");
            };
            if binding.policy_digest != expected_policy
                || binding.classification_digest == Digest32::ZERO
            {
                return reject("classification policy mismatch");
            }
            for (kind, expected) in [
                (
                    arkhe_core::work::ContextKind::SeverityClassification,
                    binding.classification_digest,
                ),
                (
                    arkhe_core::work::ContextKind::ClassificationPolicy,
                    expected_policy,
                ),
            ] {
                let mut entries = intent.context.iter().filter(|entry| entry.kind == kind);
                if entries.next().map(|entry| entry.hash) != Some(expected)
                    || entries.next().is_some()
                {
                    return reject("missing, ambiguous or mismatched classification context");
                }
            }
        }
        self.authorize_checked(intent, Some(worker), policy)
    }

    fn authorize_checked(
        &self,
        intent: &WorkIntent,
        worker_record: Option<&WorkerExecutionRecord>,
        policy: &PolicyBinding,
    ) -> AuthorizationDecision {
        if self.emergency_stop {
            return AuthorizationDecision::Reject {
                reason: "emergency stop".into(),
            };
        }

        if classify(&intent.intent_type) == Classification::Protected && worker_record.is_none() {
            return AuthorizationDecision::Reject {
                reason: "protected intent missing WorkerExecutionRecord".into(),
            };
        }

        match self.resolver.resolve(intent, policy) {
            PolicyVerdict::Allow => {
                let mut bytes = intent.digest().0.to_vec();
                bytes.extend_from_slice(&policy.policy_digest.0);
                if let Some(w) = worker_record {
                    bytes.extend_from_slice(&w.digest().0);
                }
                AuthorizationDecision::Allow {
                    authorization_ref: Digest32::blake3(b"AKG:AUTHZ:v0-REF\0", &bytes),
                }
            }
            PolicyVerdict::Deny(r) | PolicyVerdict::Inconclusive(r) => {
                AuthorizationDecision::Reject { reason: r }
            }
        }
    }
}
