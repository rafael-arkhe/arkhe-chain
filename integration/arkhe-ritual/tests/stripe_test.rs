use arkhe_ritual::{crypto::*, protocol::Request, store::Acquired, stripe_test::*};
use async_trait::async_trait;
use ed25519_dalek::SigningKey;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::sync::{Arc, Mutex};
use uuid::Uuid;
#[derive(Default)]
struct Remote {
    posts: usize,
    gets: usize,
    executions: usize,
    key: Option<String>,
    body: Option<Value>,
    lose_first: bool,
    live: bool,
    pending: bool,
}
#[derive(Clone, Default)]
struct Fake(Arc<Mutex<Remote>>);
#[async_trait]
impl StripeTransport for Fake {
    async fn call(&self, call: StripeCall) -> StripeResult<StripeResponse> {
        let mut s = self.0.lock().unwrap();
        match call {
            StripeCall::Create {
                key,
                amount,
                currency,
                effect,
                payload,
            } => {
                s.posts += 1;
                if let Some(ref prior) = s.key {
                    assert_eq!(prior, &key);
                } else {
                    s.key = Some(key);
                    s.executions += 1;
                    s.body = Some(
                        json!({"id":"pi_local_test_1","object":"payment_intent","livemode":s.live,"amount":amount,"amount_received":if s.pending{0}else{amount},"currency":currency,"status":if s.pending{"processing"}else{"succeeded"},"metadata":{"arkhe_effect_id":effect,"arkhe_payload_digest":payload}}),
                    );
                }
                if s.lose_first && s.posts == 1 {
                    return Err(StripeError::Transport);
                }
            }
            StripeCall::Retrieve { id } => {
                s.gets += 1;
                assert_eq!(id, "pi_local_test_1");
            }
        }
        Ok(StripeResponse {
            status: 200,
            request_id: Some("req_local_test".into()),
            body: s.body.clone().unwrap(),
        })
    }
}
async fn seed(pool: &PgPool) -> Acquired {
    let payload = serde_json::to_vec(&TestPayment {
        version: 1,
        amount_minor: 50,
        currency: "usd".into(),
    })
    .unwrap();
    let request = Request {
        tenant: Uuid::new_v4(),
        operation: [1; 32],
        intent: [2; 32],
        parameters: [3; 32],
        input: [4; 32],
        policy: [5; 32],
        effect_index: 0,
        destination: DESTINATION.into(),
        payload_digest: hash(b"AKG:RITUAL:PAYLOAD:v1\0", &payload),
    };
    let effect = request.effect_id().unwrap();
    let challenge = Uuid::new_v4();
    let auth = Uuid::new_v4();
    let attempt = Uuid::new_v4();
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("INSERT INTO ritual_challenges(id,tenant,nonce,request,profile,expires) VALUES($1,$2,$3,$4,'test',9999999999)")
        .bind(challenge).bind(request.tenant).bind([9u8;32].as_slice()).bind(request.commitment().unwrap().as_slice()).execute(&mut *tx).await.unwrap();
    sqlx::query("INSERT INTO ritual_effects(id,tenant,request_json,request,payload,payload_digest,state,epoch,auth_id) VALUES($1,$2,$3,$4,$5,$6,'dispatched',1,$7)")
        .bind(effect.as_slice()).bind(request.tenant).bind(serde_json::to_value(&request).unwrap()).bind(request.commitment().unwrap().as_slice()).bind(&payload).bind(request.payload_digest.as_slice()).bind(auth).execute(&mut *tx).await.unwrap();
    sqlx::query("INSERT INTO ritual_authorizations(id,effect,challenge,analysis,commitment,envelope,analysis_envelope,platform_envelope,issued,expires) VALUES($1,$2,$3,$4,$4,'{}','{}','{}',1,9999999999)")
        .bind(auth).bind(effect.as_slice()).bind(challenge).bind([8u8;32].as_slice()).execute(&mut *tx).await.unwrap();
    sqlx::query("INSERT INTO ritual_attempts(id,effect,auth_id,worker,epoch,acquired_at,lease_until,state) VALUES($1,$2,$3,'stripe-adapter-test',1,1,9999999999,'in_flight')")
        .bind(attempt).bind(effect.as_slice()).bind(auth).execute(&mut *tx).await.unwrap();
    tx.commit().await.unwrap();
    Acquired {
        effect,
        attempt,
        epoch: 1,
        payload,
        request,
    }
}
fn adapter(pool: PgPool, fake: Fake) -> StripeTestDestination<Fake> {
    StripeTestDestination::new(pool, fake, SigningKey::from_bytes(&[11; 32]))
}
async fn expire(pool: &PgPool) {
    sqlx::query("UPDATE ritual_stripe_requests SET first_post=1,post_until=2")
        .execute(pool)
        .await
        .unwrap();
}
#[test]
fn live_keys_and_unsafe_payloads_rejected() {
    assert!(matches!(
        StripeHttps::new("sk_live_do_not_use_this_key"),
        Err(StripeError::TestKeyRequired)
    ));
    assert!(StripeHttps::new("").is_err());
    for p in [
        TestPayment {
            version: 1,
            amount_minor: 5000,
            currency: "usd".into(),
        },
        TestPayment {
            version: 1,
            amount_minor: 50,
            currency: "brl".into(),
        },
    ] {
        assert!(p.validate().is_err());
    }
}
#[sqlx::test(migrations = "./migrations")]
async fn two_posts_same_idempotency_key_then_get(pool: PgPool) {
    let a = seed(&pool).await;
    let fake = Fake::default();
    let d = adapter(pool.clone(), fake.clone());
    let x = d.deliver(&a).await.unwrap();
    let y = d.deliver(&a).await.unwrap();
    assert_eq!(x.payment_intent, y.payment_intent);
    assert!(x.evidence.is_some());
    let z = d.lookup(&a).await.unwrap().unwrap();
    assert_eq!(z.payment_intent, x.payment_intent);
    let s = fake.0.lock().unwrap();
    assert_eq!((s.posts, s.gets, s.executions), (2, 1, 1));
}
#[sqlx::test(migrations = "./migrations")]
async fn lost_response_replays_with_same_key_and_one_remote_effect(pool: PgPool) {
    let a = seed(&pool).await;
    let fake = Fake::default();
    fake.0.lock().unwrap().lose_first = true;
    let d = adapter(pool.clone(), fake.clone());
    assert!(matches!(d.deliver(&a).await, Err(StripeError::Transport)));
    assert!(d.deliver(&a).await.unwrap().evidence.is_some());
    let s = fake.0.lock().unwrap();
    assert_eq!((s.posts, s.executions), (2, 1));
}
#[sqlx::test(migrations = "./migrations")]
async fn expired_window_unknown_id_never_posts_again(pool: PgPool) {
    let a = seed(&pool).await;
    let fake = Fake::default();
    fake.0.lock().unwrap().lose_first = true;
    let d = adapter(pool.clone(), fake.clone());
    assert!(d.deliver(&a).await.is_err());
    expire(&pool).await;
    assert!(matches!(
        d.deliver(&a).await,
        Err(StripeError::WindowExpired)
    ));
    assert_eq!(fake.0.lock().unwrap().posts, 1);
}
#[sqlx::test(migrations = "./migrations")]
async fn expired_window_known_id_only_retrieves(pool: PgPool) {
    let a = seed(&pool).await;
    let fake = Fake::default();
    let d = adapter(pool.clone(), fake.clone());
    d.deliver(&a).await.unwrap();
    expire(&pool).await;
    d.deliver(&a).await.unwrap();
    let s = fake.0.lock().unwrap();
    assert_eq!((s.posts, s.gets), (1, 1));
}
#[sqlx::test(migrations = "./migrations")]
async fn live_mode_response_never_creates_evidence(pool: PgPool) {
    let a = seed(&pool).await;
    let fake = Fake::default();
    fake.0.lock().unwrap().live = true;
    let d = adapter(pool.clone(), fake);
    assert!(matches!(d.deliver(&a).await, Err(StripeError::Protocol(_))));
    let evidence: Option<Value> = sqlx::query_scalar("SELECT evidence FROM ritual_stripe_requests")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(evidence.is_none());
}
#[sqlx::test(migrations = "./migrations")]
async fn stale_epoch_and_changed_payload_never_reach_provider(pool: PgPool) {
    let mut a = seed(&pool).await;
    let fake = Fake::default();
    let d = adapter(pool.clone(), fake.clone());
    a.epoch = 99;
    assert!(d.deliver(&a).await.is_err());
    a.epoch = 1;
    a.payload = b"other".to_vec();
    assert!(d.deliver(&a).await.is_err());
    assert_eq!(fake.0.lock().unwrap().posts, 0);
}

#[sqlx::test(migrations = "./migrations")]
async fn pending_result_is_persisted_but_never_signed_as_success(pool: PgPool) {
    let a = seed(&pool).await;
    let fake = Fake::default();
    fake.0.lock().unwrap().pending = true;
    let d = adapter(pool.clone(), fake.clone());
    assert!(d.deliver(&a).await.unwrap().evidence.is_none());
    let observation = d.lookup(&a).await.unwrap().unwrap();
    assert!(observation.evidence.is_none());
    assert_eq!(observation.status, "processing");
}
#[sqlx::test(migrations = "./migrations")]
async fn mismatched_provider_metadata_is_rejected(pool: PgPool) {
    let a = seed(&pool).await;
    let fake = Fake::default();
    let d = adapter(pool.clone(), fake.clone());
    d.deliver(&a).await.unwrap();
    fake.0.lock().unwrap().body.as_mut().unwrap()["metadata"]["arkhe_effect_id"] = json!("wrong");
    assert!(matches!(d.lookup(&a).await, Err(StripeError::Protocol(_))));
}
