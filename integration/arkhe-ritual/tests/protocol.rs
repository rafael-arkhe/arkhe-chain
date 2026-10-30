use arkhe_ritual::{crypto::*, destination::*, protocol::*, store::*, Error, Result};
use async_trait::async_trait;
use ed25519_dalek::SigningKey;
use sqlx::PgPool;
use uuid::Uuid;
struct Rule(bool);
#[async_trait]
impl GatePolicy for Rule {
    async fn authorize(&self, _: &VerifiedAnalysis) -> Result<()> {
        if self.0 {
            Ok(())
        } else {
            Err(Error::Rejected("operation denied"))
        }
    }
}
struct Fixture {
    store: Store,
    request: Request,
    payload: Vec<u8>,
    challenge: Challenge,
    bundle: AnalysisBundle,
    verifier: MockPlatformVerifier,
    auth: Envelope,
    vendor: SigningKey,
    app: SigningKey,
    issuer: GateIssuer,
}
impl Fixture {
    async fn new(pool: PgPool) -> Self {
        let vendor = SigningKey::from_bytes(&[1; 32]);
        let app = SigningKey::from_bytes(&[2; 32]);
        let issuer = GateIssuer::new(SigningKey::from_bytes(&[3; 32]));
        let store = Store::new(pool, issuer.public_key(), SigningKey::from_bytes(&[4; 32]));
        store
            .register_destination(
                "test-destination",
                &SigningKey::from_bytes(&[11; 32]).verifying_key(),
            )
            .await
            .unwrap();
        let payload = b"authorized payload".to_vec();
        let request = Request {
            tenant: Uuid::new_v4(),
            operation: [5; 32],
            intent: [6; 32],
            parameters: [7; 32],
            input: [8; 32],
            policy: [9; 32],
            effect_index: 0,
            destination: "test-destination".into(),
            payload_digest: hash(b"AKG:RITUAL:PAYLOAD:v1\0", &payload),
        };
        store.set_policy(request.policy, true).await.unwrap();
        let challenge = store
            .issue_challenge(request.tenant, &request, 300)
            .await
            .unwrap();
        let verifier = MockPlatformVerifier::new(vendor.verifying_key(), [[10; 32]], true);
        let bundle = make_bundle(&vendor, &app, &request, &challenge);
        let now = store.now().await.unwrap();
        let verified = verifier
            .verify(&bundle, &challenge, &request, &payload, now)
            .unwrap();
        let auth = issuer
            .issue(&Rule(true), &verified, &challenge, now, 300)
            .await
            .unwrap();
        Self {
            store,
            request,
            payload,
            challenge,
            bundle,
            verifier,
            auth,
            vendor,
            app,
            issuer,
        }
    }
    async fn accept(&self) -> Result<Accepted> {
        self.store
            .accept(
                self.request.tenant,
                &self.request,
                &self.payload,
                &self.challenge,
                &self.bundle,
                &self.verifier,
                &self.auth,
            )
            .await
    }
    fn destination(&self) -> DatabaseDestination {
        DatabaseDestination::new(
            self.store.pool().clone(),
            self.request.destination.clone(),
            SigningKey::from_bytes(&[11; 32]),
        )
    }
    async fn second_authorization(&self) -> (Challenge, AnalysisBundle, Envelope) {
        let c = self
            .store
            .issue_challenge(self.request.tenant, &self.request, 300)
            .await
            .unwrap();
        let b = make_bundle(&self.vendor, &self.app, &self.request, &c);
        let now = self.store.now().await.unwrap();
        let v = self
            .verifier
            .verify(&b, &c, &self.request, &self.payload, now)
            .unwrap();
        let a = self
            .issuer
            .issue(&Rule(true), &v, &c, now, 300)
            .await
            .unwrap();
        (c, b, a)
    }
}
fn make_bundle(
    vendor: &SigningKey,
    app: &SigningKey,
    request: &Request,
    c: &Challenge,
) -> AnalysisBundle {
    let p = PlatformClaim {
        profile: PROFILE.into(),
        measurement: [10; 32],
        instance: [12; 32],
        app_key: app.verifying_key().to_bytes(),
        challenge: c.id,
        nonce: c.nonce,
        tenant: c.tenant,
        request: c.request,
        expires: c.expires,
    };
    let platform = Envelope::sign(&p, PLATFORM, vendor).unwrap();
    let a = Analysis {
        request: request.clone(),
        challenge: c.id,
        nonce: c.nonce,
        profile: PROFILE.into(),
        attestation: digest(b"AKG:RITUAL:PLATFORM-ENVELOPE:v1\0", &platform).unwrap(),
        output: [13; 32],
    };
    let statement = Envelope::sign(&a, ANALYSIS, app).unwrap();
    AnalysisBundle {
        platform,
        statement,
    }
}

#[sqlx::test(migrations = "./migrations")]
async fn happy_path_and_receipt_binding(pool: PgPool) {
    let f = Fixture::new(pool).await;
    assert!(matches!(f.accept().await.unwrap(), Accepted::New(_)));
    let a = f.store.acquire("worker", 30).await.unwrap().unwrap();
    let d = f.destination();
    let evidence = d.deliver(&f.request, &f.payload).await.unwrap();
    let signed = f
        .store
        .confirm(&a, &evidence, &d.public_key())
        .await
        .unwrap();
    let receipt: ExecutionReceipt = signed.open(RECEIPT, &f.store.audit_key()).unwrap();
    assert_eq!(receipt.effect, f.request.effect_id().unwrap());
    assert!(
        arkhe_ritual::arkhe::audit_envelope(&signed, &f.store.audit_key(), f.request.policy)
            .is_ok()
    );
    assert!(arkhe_ritual::arkhe::audit_envelope(&signed, &f.store.audit_key(), [0; 32]).is_err());
    let again = f
        .store
        .confirm(&a, &evidence, &d.public_key())
        .await
        .unwrap();
    assert_eq!(again.json, signed.json);
}
#[sqlx::test(migrations = "./migrations")]
async fn policy_denies_attested_operation(pool: PgPool) {
    let f = Fixture::new(pool).await;
    let now = f.store.now().await.unwrap();
    let v = f
        .verifier
        .verify(&f.bundle, &f.challenge, &f.request, &f.payload, now)
        .unwrap();
    assert!(f
        .issuer
        .issue(&Rule(false), &v, &f.challenge, now, 300)
        .await
        .is_err());
    let consumed: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT consumed_by FROM ritual_challenges WHERE id=$1")
            .bind(f.challenge.id)
            .fetch_one(f.store.pool())
            .await
            .unwrap();
    assert!(consumed.is_none());
}
#[sqlx::test(migrations = "./migrations")]
async fn wrong_nonce_valid_signature_rejected(pool: PgPool) {
    let mut f = Fixture::new(pool).await;
    let mut c = f.challenge.clone();
    c.nonce = [99; 32];
    f.bundle = make_bundle(&f.vendor, &f.app, &f.request, &c);
    assert!(matches!(
        f.accept().await,
        Err(Error::Rejected("nonce mismatch"))
    ));
}
#[sqlx::test(migrations = "./migrations")]
async fn tampered_signature_and_unknown_vendor(pool: PgPool) {
    let mut f = Fixture::new(pool).await;
    f.bundle.statement.signature[0] ^= 1;
    assert!(f.accept().await.is_err());
    f.bundle = make_bundle(&f.vendor, &f.app, &f.request, &f.challenge);
    f.verifier = MockPlatformVerifier::new(
        SigningKey::from_bytes(&[90; 32]).verifying_key(),
        [[10; 32]],
        true,
    );
    assert!(f.accept().await.is_err());
}
#[sqlx::test(migrations = "./migrations")]
async fn mock_disabled_and_unapproved_measurement(pool: PgPool) {
    let mut f = Fixture::new(pool).await;
    f.verifier = MockPlatformVerifier::new(f.vendor.verifying_key(), [[10; 32]], false);
    assert!(f.accept().await.is_err());
    f.verifier = MockPlatformVerifier::new(f.vendor.verifying_key(), [[91; 32]], true);
    assert!(f.accept().await.is_err());
}
#[sqlx::test(migrations = "./migrations")]
async fn concurrent_same_challenge_one_effect_and_outbox(pool: PgPool) {
    let f = Fixture::new(pool).await;
    let (a, b) = tokio::time::timeout(std::time::Duration::from_secs(10), async {
        tokio::join!(f.accept(), f.accept())
    })
    .await
    .unwrap();
    let results = [a.unwrap(), b.unwrap()];
    assert_eq!(
        results
            .iter()
            .filter(|v| matches!(v, Accepted::New(_)))
            .count(),
        1
    );
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM ritual_outbox")
        .fetch_one(f.store.pool())
        .await
        .unwrap();
    assert_eq!(n, 1);
}
#[sqlx::test(migrations = "./migrations")]
async fn different_challenges_same_effect_serialized(pool: PgPool) {
    let f = Fixture::new(pool).await;
    let (c, b, a) = f.second_authorization().await;
    let (x, y) = tokio::time::timeout(std::time::Duration::from_secs(10), async {
        tokio::join!(
            f.accept(),
            f.store.accept(
                f.request.tenant,
                &f.request,
                &f.payload,
                &c,
                &b,
                &f.verifier,
                &a
            )
        )
    })
    .await
    .unwrap();
    assert!(x.is_ok() && y.is_ok());
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM ritual_authorizations")
        .fetch_one(f.store.pool())
        .await
        .unwrap();
    assert_eq!(n, 1);
}
#[sqlx::test(migrations = "./migrations")]
async fn payload_and_tenant_swap_before_replay(pool: PgPool) {
    let f = Fixture::new(pool).await;
    f.accept().await.unwrap();
    assert!(f
        .store
        .accept(
            Uuid::new_v4(),
            &f.request,
            &f.payload,
            &f.challenge,
            &f.bundle,
            &f.verifier,
            &f.auth
        )
        .await
        .is_err());
    assert!(f
        .store
        .accept(
            f.request.tenant,
            &f.request,
            b"different",
            &f.challenge,
            &f.bundle,
            &f.verifier,
            &f.auth
        )
        .await
        .is_err());
}
#[sqlx::test(migrations = "./migrations")]
async fn forged_gate_and_changed_analysis_rejected(pool: PgPool) {
    let mut f = Fixture::new(pool).await;
    f.auth.signature[0] ^= 1;
    assert!(f.accept().await.is_err());
    let (_, _, a) = f.second_authorization().await;
    f.auth = a;
    assert!(f.accept().await.is_err());
}
#[sqlx::test(migrations = "./migrations")]
async fn emergency_stop_and_revocation_before_dispatch(pool: PgPool) {
    let f = Fixture::new(pool).await;
    f.accept().await.unwrap();
    f.store.emergency_stop(true).await.unwrap();
    assert!(f.store.acquire("worker", 30).await.unwrap().is_none());
    f.store.emergency_stop(false).await.unwrap();
    f.store.set_policy(f.request.policy, false).await.unwrap();
    assert!(f.store.acquire("worker", 30).await.unwrap().is_none());
}
#[sqlx::test(migrations = "./migrations")]
async fn invalid_accept_does_not_consume_challenge(pool: PgPool) {
    let f = Fixture::new(pool).await;
    f.store.set_policy(f.request.policy, false).await.unwrap();
    assert!(f.accept().await.is_err());
    f.store.set_policy(f.request.policy, true).await.unwrap();
    assert!(f.accept().await.is_ok());
}
#[sqlx::test(migrations = "./migrations")]
async fn committed_destination_lost_response_reconcile_after_restart(pool: PgPool) {
    let f = Fixture::new(pool).await;
    f.accept().await.unwrap();
    let a = f.store.acquire("old", 30).await.unwrap().unwrap();
    let d = f.destination();
    let signed = d.deliver(&f.request, &f.payload).await.unwrap();
    sqlx::query("UPDATE ritual_attempts SET lease_until=0 WHERE id=$1")
        .bind(a.attempt)
        .execute(f.store.pool())
        .await
        .unwrap();
    assert!(f.store.recover_stale(a.effect).await.unwrap());
    assert!(f.store.confirm(&a, &signed, &d.public_key()).await.is_err());
    assert!(f.store.acquire("new", 30).await.unwrap().is_none());
    drop(d);
    let restarted = f.destination();
    let old = restarted.lookup(a.effect).await.unwrap().unwrap();
    f.store
        .reconcile(a.effect, &old, &restarted.public_key())
        .await
        .unwrap();
    assert!(matches!(f.accept().await.unwrap(),Accepted::Existing{state,..} if state=="confirmed"));
}
#[sqlx::test(migrations = "./migrations")]
async fn destination_two_deliveries_and_concurrency(pool: PgPool) {
    let f = Fixture::new(pool).await;
    let d = f.destination();
    let (x, y) = tokio::join!(
        d.deliver(&f.request, &f.payload),
        d.deliver(&f.request, &f.payload)
    );
    assert_eq!(x.unwrap().json, y.unwrap().json);
    let n: i32 = sqlx::query_scalar("SELECT executions FROM ritual_destination_receipts")
        .fetch_one(f.store.pool())
        .await
        .unwrap();
    assert_eq!(n, 1);
    let restarted = f.destination();
    assert!(restarted
        .lookup(f.request.effect_id().unwrap())
        .await
        .unwrap()
        .is_some());
}
#[sqlx::test(migrations = "./migrations")]
async fn wrong_destination_signature_and_effect_rejected(pool: PgPool) {
    let f = Fixture::new(pool).await;
    f.accept().await.unwrap();
    let a = f.store.acquire("worker", 30).await.unwrap().unwrap();
    let d = f.destination();
    let evidence = d.deliver(&f.request, &f.payload).await.unwrap();
    assert!(f
        .store
        .confirm(
            &a,
            &evidence,
            &SigningKey::from_bytes(&[88; 32]).verifying_key()
        )
        .await
        .is_err());
    let mut forged: DestinationEvidence = evidence.open(EVIDENCE, &d.public_key()).unwrap();
    forged.effect = [0; 32];
    let signed = Envelope::sign(&forged, EVIDENCE, &SigningKey::from_bytes(&[11; 32])).unwrap();
    assert!(f.store.confirm(&a, &signed, &d.public_key()).await.is_err());
}

#[test]
fn canonical_signature_and_unknown_fields() {
    let key = SigningKey::from_bytes(&[7; 32]);
    let a = Authorization {
        id: Uuid::nil(),
        challenge: Uuid::nil(),
        tenant: Uuid::nil(),
        request: [1; 32],
        effect: [2; 32],
        analysis: [3; 32],
        policy: [4; 32],
        profile: PROFILE.into(),
        allow: true,
        issued: 1,
        expires: 2,
    };
    let signed = Envelope::sign(&a, AUTH, &key).unwrap();
    assert!(signed
        .open::<Authorization>(AUTH, &key.verifying_key())
        .is_ok());
    assert!(signed
        .open::<Authorization>(ANALYSIS, &key.verifying_key())
        .is_err());
    let mut bad = signed.clone();
    bad.json.splice(1..1, b"\"unknown\":true,".iter().copied());
    assert!(bad
        .open::<Authorization>(AUTH, &key.verifying_key())
        .is_err());
    let bytes = canonical(&a).unwrap();
    let decoded: ciborium::Value = ciborium::from_reader(bytes.as_slice()).unwrap();
    let mut again = Vec::new();
    ciborium::into_writer(&decoded, &mut again).unwrap();
    assert_eq!(bytes, again);
}

#[test]
fn effect_identity_excludes_policy_and_analysis_but_not_destination() {
    let mut r = Request {
        tenant: Uuid::nil(),
        operation: [1; 32],
        intent: [2; 32],
        parameters: [3; 32],
        input: [4; 32],
        policy: [5; 32],
        effect_index: 0,
        destination: "first".into(),
        payload_digest: [6; 32],
    };
    let original = r.effect_id().unwrap();
    let commitment = r.commitment().unwrap();
    r.policy = [7; 32];
    r.intent = [8; 32];
    r.input = [9; 32];
    r.payload_digest = [10; 32];
    assert_eq!(original, r.effect_id().unwrap());
    assert_ne!(commitment, r.commitment().unwrap());
    r.destination = "second".into();
    assert_ne!(original, r.effect_id().unwrap());
}

#[test]
fn pinned_authorization_vector_matches_rust_encoder_and_signature() {
    let vector: serde_json::Value =
        serde_json::from_str(include_str!("../vectors/authorization-v1.json")).unwrap();
    let json = vector["json"].as_str().unwrap();
    let auth: Authorization = serde_json::from_str(json).unwrap();
    let encoded = canonical(&auth).unwrap();
    assert_eq!(hex::encode(&encoded), vector["cbor_hex"].as_str().unwrap());
    assert_eq!(
        hex::encode(digest(AUTH, &auth).unwrap()),
        vector["digest_hex"].as_str().unwrap()
    );
    let key = SigningKey::from_bytes(&[7; 32]);
    let signed = Envelope::sign(&auth, AUTH, &key).unwrap();
    assert_eq!(
        hex::encode(key.verifying_key().to_bytes()),
        vector["public_key_hex"].as_str().unwrap()
    );
    assert_eq!(
        hex::encode(&signed.signature),
        vector["signature_hex"].as_str().unwrap()
    );
    signed
        .open::<Authorization>(AUTH, &key.verifying_key())
        .unwrap();
}

#[sqlx::test(migrations = "./migrations")]
async fn failure_after_consumption_rolls_everything_back(pool: PgPool) {
    let f = Fixture::new(pool).await;
    sqlx::query("ALTER TABLE ritual_outbox ADD CONSTRAINT injected_failure CHECK(FALSE)")
        .execute(f.store.pool())
        .await
        .unwrap();
    assert!(f.accept().await.is_err());
    let c: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT consumed_by FROM ritual_challenges WHERE id=$1")
            .bind(f.challenge.id)
            .fetch_one(f.store.pool())
            .await
            .unwrap();
    assert!(c.is_none());
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM ritual_effects")
        .fetch_one(f.store.pool())
        .await
        .unwrap();
    assert_eq!(n, 0);
    sqlx::query("ALTER TABLE ritual_outbox DROP CONSTRAINT injected_failure")
        .execute(f.store.pool())
        .await
        .unwrap();
    assert!(f.accept().await.is_ok());
}
#[sqlx::test(migrations = "./migrations")]
async fn fee_is_atomic_and_replay_is_free(pool: PgPool) {
    let mut f = Fixture::new(pool).await;
    f.store = f.store.with_simulated_fee(10).unwrap();
    f.store
        .set_simulated_balance(f.request.tenant, 9)
        .await
        .unwrap();
    assert!(f.accept().await.is_err());
    f.store
        .set_simulated_balance(f.request.tenant, 20)
        .await
        .unwrap();
    f.accept().await.unwrap();
    f.accept().await.unwrap();
    let balance: i64 =
        sqlx::query_scalar("SELECT balance FROM ritual_fee_accounts WHERE tenant=$1")
            .bind(f.request.tenant)
            .fetch_one(f.store.pool())
            .await
            .unwrap();
    assert_eq!(balance, 10);
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM ritual_fee_ledger")
        .fetch_one(f.store.pool())
        .await
        .unwrap();
    assert_eq!(n, 1);
}
#[sqlx::test(migrations = "./migrations")]
async fn retry_requires_new_auth_and_durable_destination(pool: PgPool) {
    let f = Fixture::new(pool).await;
    f.accept().await.unwrap();
    let old = f.store.acquire("old", 30).await.unwrap().unwrap();
    sqlx::query("UPDATE ritual_attempts SET lease_until=0 WHERE id=$1")
        .bind(old.attempt)
        .execute(f.store.pool())
        .await
        .unwrap();
    f.store.recover_stale(old.effect).await.unwrap();
    let d = f.destination();
    assert!(f
        .store
        .retry_unknown(
            f.request.tenant,
            &f.request,
            &f.payload,
            &f.challenge,
            &f.bundle,
            &f.verifier,
            &f.auth,
            &d
        )
        .await
        .is_err());
    let (c, b, a) = f.second_authorization().await;
    assert!(f
        .store
        .retry_unknown(
            f.request.tenant,
            &f.request,
            &f.payload,
            &c,
            &b,
            &f.verifier,
            &a,
            &d
        )
        .await
        .unwrap());
    let new = f.store.acquire("new", 30).await.unwrap().unwrap();
    assert!(new.epoch > old.epoch);
    let evidence = d.deliver(&f.request, &f.payload).await.unwrap();
    assert!(f
        .store
        .confirm(&old, &evidence, &d.public_key())
        .await
        .is_err());
    f.store
        .confirm(&new, &evidence, &d.public_key())
        .await
        .unwrap();
}
#[sqlx::test(migrations = "./migrations")]
async fn signed_checkpoint_offline_wrong_root_and_key(pool: PgPool) {
    use arkhe_ritual::anchor;
    use arkhe_wormgraph::anchor::CheckpointTrust;
    let f = Fixture::new(pool).await;
    f.accept().await.unwrap();
    let a = f.store.acquire("worker", 30).await.unwrap().unwrap();
    let d = f.destination();
    let evidence = d.deliver(&f.request, &f.payload).await.unwrap();
    f.store
        .confirm(&a, &evidence, &d.public_key())
        .await
        .unwrap();
    let key = SigningKey::from_bytes(&[20; 32]);
    let log = [21; 32];
    let mut p = anchor::append_receipt(
        f.store.pool(),
        f.request.tenant,
        a.effect,
        log,
        &key,
        &f.store.audit_key(),
    )
    .await
    .unwrap();
    let trust = CheckpointTrust {
        log_id: log,
        public_key: key.verifying_key().to_bytes(),
        tenant_id: f.request.tenant.to_string(),
        stream_id: "ritual-receipts-v1".into(),
        minimum_leaf_count: 1,
        maximum_leaf_count: 100,
        earliest_issued_at: 0,
        latest_issued_at: u64::MAX,
    };
    anchor::verify(&p, &trust, &f.store.audit_key()).unwrap();
    anchor::verify_authorization(&p, &trust, &f.store.audit_key(), &f.issuer.public_key()).unwrap();
    p.checkpoint.root[0] ^= 1;
    assert!(anchor::verify(&p, &trust, &f.store.audit_key()).is_err());
    // Even a correctly signed checkpoint with a different root must not validate
    // the original membership path.
    use ed25519_dalek::Signer;
    let original_signature = p.checkpoint.signature_hex.clone();
    p.checkpoint.signature_hex = hex::encode(key.sign(&p.checkpoint.signing_bytes()).to_bytes());
    assert!(anchor::verify(&p, &trust, &f.store.audit_key()).is_err());
    p.checkpoint.root[0] ^= 1;
    p.checkpoint.signature_hex = original_signature;
    let mut wrong = trust.clone();
    wrong.public_key = SigningKey::from_bytes(&[22; 32]).verifying_key().to_bytes();
    assert!(anchor::verify(&p, &wrong, &f.store.audit_key()).is_err());
    p.record[0] ^= 1;
    assert!(anchor::verify(&p, &trust, &f.store.audit_key()).is_err());
}
#[sqlx::test(migrations = "./migrations")]
async fn confirmed_effect_not_reauthorized_by_fresh_challenge(pool: PgPool) {
    let f = Fixture::new(pool).await;
    f.accept().await.unwrap();
    let a = f.store.acquire("worker", 30).await.unwrap().unwrap();
    let d = f.destination();
    let evidence = d.deliver(&f.request, &f.payload).await.unwrap();
    f.store
        .confirm(&a, &evidence, &d.public_key())
        .await
        .unwrap();
    let (c, b, a) = f.second_authorization().await;
    assert!(
        matches!(f.store.accept(f.request.tenant,&f.request,&f.payload,&c,&b,&f.verifier,&a).await.unwrap(),Accepted::Existing{state,..} if state=="confirmed")
    );
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM ritual_outbox")
        .fetch_one(f.store.pool())
        .await
        .unwrap();
    assert_eq!(n, 1);
}
