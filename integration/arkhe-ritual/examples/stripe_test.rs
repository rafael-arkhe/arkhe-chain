//! Explicitly opt-in: creates test-mode Stripe objects using pm_card_visa.
//! Fixture signing keys and mock platform evidence are not production credentials.
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
    store::{Accepted, Store},
    stripe_test::*,
};
use async_trait::async_trait;
use ed25519_dalek::SigningKey;
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;
struct DemoPolicy;
impl PolicyResolver for DemoPolicy {
    fn resolve(&self, intent: &WorkIntent, _: &PolicyBinding) -> PolicyVerdict {
        if intent.intent_type == WorkIntentType::ApproveExpense {
            PolicyVerdict::Allow
        } else {
            PolicyVerdict::Deny("demo only approves its resolved test payment".into())
        }
    }
    fn required_worker_evidence(
        &self,
        _: &WorkIntent,
        _: &PolicyBinding,
    ) -> Option<EvidenceKindRequirement> {
        Some(EvidenceKindRequirement {
            allowed_modules: vec!["stripe-test-demo".into()],
            allowed_operations: vec![CognitiveOperation::Analyze],
        })
    }
}
struct Reader(EvidenceEnvelope);
#[async_trait]
impl EvidenceReader for Reader {
    async fn get(&self, h: Digest32) -> Result<Option<EvidenceEnvelope>, String> {
        Ok((h == self.0.record_hash).then(|| self.0.clone()))
    }
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Fail before any provider request unless both explicit opt-in and test key exist.
    if std::env::var("ARKHE_RUN_STRIPE_TEST").as_deref() != Ok("1") {
        return Err(
            "Set ARKHE_RUN_STRIPE_TEST=1 to authorize creation of Stripe sandbox objects".into(),
        );
    }
    let secret = std::env::var("STRIPE_TEST_SECRET_KEY")
        .map_err(|_| "STRIPE_TEST_SECRET_KEY missing; do not paste it into chat")?;
    let transport = StripeHttps::new(&secret)?;
    let url = std::env::var("DATABASE_URL")
        .map_err(|_| "DATABASE_URL must reference an isolated test database")?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await?;
    let issuer = GateIssuer::new(SigningKey::from_bytes(&[3; 32]));
    let store = Store::new(
        pool.clone(),
        issuer.public_key(),
        SigningKey::from_bytes(&[4; 32]),
    );
    store.migrate().await?;
    let destination =
        StripeTestDestination::new(pool.clone(), transport, SigningKey::from_bytes(&[11; 32]));
    store
        .register_destination(DESTINATION, &destination.public_key())
        .await?;
    let payload = serde_json::to_vec(&TestPayment {
        version: 1,
        amount_minor: 50,
        currency: "usd".into(),
    })?;
    let parameters = Digest32(hash(b"AKG:RITUAL:STRIPE-DEMO-PARAMETERS:v1\0", &payload));
    let worker = WorkerExecutionRecord {
        classification: None,
        operation: Some(CognitiveOperation::Analyze),
        module_id: "stripe-test-demo".into(),
        module_version: "1".into(),
        input_digest: Digest32([1; 32]),
        output_digest: parameters,
        evidence_refs: vec![],
        confidence_bps: None,
        uncertainty_note: None,
        execution_id: "stripe-demo".into(),
    };
    let operation =
        std::env::var("STRIPE_TEST_OPERATION").unwrap_or_else(|_| "stripe-sandbox-demo-v1".into());
    let intent = WorkIntent {
        requested_by: "stripe-test-demo".into(),
        intent_type: WorkIntentType::ApproveExpense,
        target: Digest32([2; 32]),
        parameters_digest: parameters,
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
        request_identity: RequestIdentity::new(operation.as_bytes()),
        claimed_created_at: 0,
    };
    let policy = PolicyBinding {
        policy_id: "stripe-test-demo".into(),
        version: 1,
        policy_digest: Digest32([9; 32]),
    };
    let request = Request {
        tenant: Uuid::nil(),
        operation: intent.operation_id().0,
        intent: intent.object_digest().0,
        parameters: parameters.0,
        input: worker.input_digest.0,
        policy: policy.policy_digest.0,
        effect_index: 0,
        destination: DESTINATION.into(),
        payload_digest: hash(b"AKG:RITUAL:PAYLOAD:v1\0", &payload),
    };
    let binding = EffectBinding {
        destination: DESTINATION.into(),
        payload_digest: request.payload_digest,
        effect_index: 0,
    };
    let reader = Reader(EvidenceEnvelope {
        record_hash: worker.digest(),
        kind: "WorkerExecutionRecord".into(),
        subject: worker.input_digest,
        payload_digest: worker.digest(),
        policy_digest: Some(policy.policy_digest),
        causal_parents: vec![],
    });
    let gate = ContainmentGate::new(DemoPolicy);
    let adapter = ArkheGate {
        gate: &gate,
        intent: &intent,
        worker: &worker,
        policy: &policy,
        evidence: &reader,
        effect: &binding,
    };
    store.set_policy(request.policy, true).await?;
    let challenge = store.issue_challenge(request.tenant, &request, 300).await?;
    let vendor = SigningKey::from_bytes(&[1; 32]);
    let app = SigningKey::from_bytes(&[2; 32]);
    let platform = Envelope::sign(
        &PlatformClaim {
            profile: PROFILE.into(),
            measurement: [10; 32],
            instance: [12; 32],
            app_key: app.verifying_key().to_bytes(),
            challenge: challenge.id,
            nonce: challenge.nonce,
            tenant: request.tenant,
            request: challenge.request,
            expires: challenge.expires,
        },
        PLATFORM,
        &vendor,
    )?;
    let statement = Envelope::sign(
        &Analysis {
            request: request.clone(),
            challenge: challenge.id,
            nonce: challenge.nonce,
            profile: PROFILE.into(),
            attestation: digest(b"AKG:RITUAL:PLATFORM-ENVELOPE:v1\0", &platform)?,
            output: worker.output_digest.0,
        },
        ANALYSIS,
        &app,
    )?;
    let bundle = AnalysisBundle {
        platform,
        statement,
    };
    let verifier = MockPlatformVerifier::new(vendor.verifying_key(), [[10; 32]], true);
    let verified = verifier.verify(&bundle, &challenge, &request, &payload, store.now().await?)?;
    let auth = issuer
        .issue(&adapter, &verified, &challenge, store.now().await?, 300)
        .await?;
    let accepted = store
        .accept(
            request.tenant,
            &request,
            &payload,
            &challenge,
            &bundle,
            &verifier,
            &auth,
        )
        .await?;
    match accepted {
        Accepted::Existing { effect, state } => {
            let mut state = state;
            if state == "dispatched" && store.recover_stale(effect).await? {
                state = "unknown".into();
            }
            let observation = destination.lookup_effect(effect).await?;
            if state == "unknown" {
                if let Some(ref o) = observation {
                    if let Some(ref evidence) = o.evidence {
                        store
                            .reconcile(effect, evidence, &destination.public_key())
                            .await?;
                        state = "confirmed".into();
                    }
                }
            }
            println!(
                "{}",
                serde_json::to_string_pretty(
                    &serde_json::json!({"existing_state":state,"observation":observation,"new_posts":0,"platform":"mock"})
                )?
            );
        }
        Accepted::New(_) => {
            let acquired = store
                .acquire("stripe-test-demo", 30)
                .await?
                .ok_or("no dispatch acquired")?;
            // Two actual POSTs, same effect/key/content. Stripe must return same ID.
            let first = destination.deliver(&acquired).await?;
            let second = destination.deliver(&acquired).await?;
            if first.payment_intent != second.payment_intent {
                return Err("Stripe did not return the same resource".into());
            }
            let fetched = destination
                .lookup(&acquired)
                .await?
                .ok_or("provider ID missing")?;
            let evidence = fetched
                .evidence
                .as_ref()
                .ok_or("Stripe resource did not succeed; reconcile existing ID")?;
            store
                .confirm(&acquired, evidence, &destination.public_key())
                .await?;
            println!(
                "{}",
                serde_json::to_string_pretty(
                    &serde_json::json!({"first":first,"second":second,"retrieved":fetched,"same_payment_intent":true,"create_posts":2,"platform":"mock","real_money":false})
                )?
            );
        }
    }
    Ok(())
}
