//! Stripe test-mode PaymentIntent adapter. Stripe JSON is authenticated through TLS;
//! our bridge signs the normalized observation. It is NOT a Stripe/TEE signature.
use crate::{
    crypto::{digest, Envelope, Hash},
    destination::EVIDENCE,
    protocol::DestinationEvidence,
    require,
    store::Acquired,
    Error,
};
use async_trait::async_trait;
use ed25519_dalek::{SigningKey, VerifyingKey};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Row};
use std::time::Duration;

pub const DESTINATION: &str = "stripe-test:v1";
const POST_WINDOW: i64 = 23 * 60 * 60;
#[derive(Debug, thiserror::Error)]
pub enum StripeError {
    #[error("Stripe test key missing or not sk_test_")]
    TestKeyRequired,
    #[error("Stripe transport failed; result may be unknown")]
    Transport,
    #[error("Stripe HTTP status {0}; no automatic retry")]
    Http(u16),
    #[error("Stripe result not succeeded; retrieve/reconcile the existing resource")]
    NotSucceeded,
    #[error("idempotency replay window expired; manual reconciliation required")]
    WindowExpired,
    #[error("Stripe protocol: {0}")]
    Protocol(&'static str),
    #[error(transparent)]
    Core(#[from] Error),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Encoding(#[from] serde_json::Error),
}
pub type StripeResult<T> = std::result::Result<T, StripeError>;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TestPayment {
    pub version: u8,
    pub amount_minor: u32,
    pub currency: String,
}
impl TestPayment {
    pub fn validate(&self) -> StripeResult<()> {
        if self.version != 1 || self.currency != "usd" || !(50..=100).contains(&self.amount_minor) {
            return Err(StripeError::Protocol(
                "test payload permits only 50..100 USD cents, version 1",
            ));
        }
        Ok(())
    }
}
#[derive(Debug, Clone)]
pub enum StripeCall {
    Create {
        key: String,
        amount: u32,
        currency: String,
        effect: String,
        payload: String,
    },
    Retrieve {
        id: String,
    },
}
pub struct StripeResponse {
    pub status: u16,
    pub request_id: Option<String>,
    pub body: Value,
}
#[async_trait]
pub trait StripeTransport: Send + Sync {
    async fn call(&self, call: StripeCall) -> StripeResult<StripeResponse>;
}
/// Fixed HTTPS origin, no redirects, no live keys. Not Debug to prevent key logging.
pub struct StripeHttps {
    client: reqwest::Client,
}
impl StripeHttps {
    pub fn new(test_key: &str) -> StripeResult<Self> {
        if !test_key.starts_with("sk_test_") || test_key.len() < 16 {
            return Err(StripeError::TestKeyRequired);
        }
        let mut header = HeaderValue::from_str(&format!("Bearer {test_key}"))
            .map_err(|_| StripeError::TestKeyRequired)?;
        header.set_sensitive(true);
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, header);
        let client = reqwest::Client::builder()
            .default_headers(headers)
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .user_agent("arkhe-ritual-stripe-test/0.1")
            .build()
            .map_err(|_| StripeError::Transport)?;
        Ok(Self { client })
    }
}
#[async_trait]
impl StripeTransport for StripeHttps {
    async fn call(&self, call: StripeCall) -> StripeResult<StripeResponse> {
        let req = match call {
            StripeCall::Create {
                key,
                amount,
                currency,
                effect,
                payload,
            } => self
                .client
                .post("https://api.stripe.com/v1/payment_intents")
                .header("Idempotency-Key", key)
                .form(&[
                    ("amount", amount.to_string()),
                    ("currency", currency),
                    ("payment_method", "pm_card_visa".into()),
                    ("payment_method_types[]", "card".into()),
                    ("confirm", "true".into()),
                    ("metadata[arkhe_effect_id]", effect),
                    ("metadata[arkhe_payload_digest]", payload),
                ]),
            StripeCall::Retrieve { id } => {
                if !valid_id(&id) {
                    return Err(StripeError::Protocol("invalid PaymentIntent ID"));
                }
                self.client
                    .get(format!("https://api.stripe.com/v1/payment_intents/{id}"))
            }
        };
        let response = req.send().await.map_err(|_| StripeError::Transport)?;
        let status = response.status().as_u16();
        let request_id = response
            .headers()
            .get("request-id")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        if !(200..300).contains(&status) {
            return Err(StripeError::Http(status));
        }
        // Raw body may contain client_secret: never log or persist it.
        let bytes = response.bytes().await.map_err(|_| StripeError::Transport)?;
        if bytes.len() > 1_048_576 {
            return Err(StripeError::Protocol("oversized provider response"));
        }
        let body = serde_json::from_slice(&bytes)?;
        Ok(StripeResponse {
            status,
            request_id,
            body,
        })
    }
}
fn valid_id(id: &str) -> bool {
    id.starts_with("pi_")
        && id.len() <= 128
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}
#[derive(Debug, Clone, Serialize)]
pub struct Observation {
    pub payment_intent: String,
    pub stripe_request_id: Option<String>,
    pub status: String,
    pub livemode: bool,
    pub amount_minor: u32,
    pub currency: String,
    pub effect: Hash,
    pub evidence: Option<Envelope>,
}
pub struct StripeTestDestination<T: StripeTransport> {
    pool: PgPool,
    transport: T,
    key: SigningKey,
}
impl<T: StripeTransport> StripeTestDestination<T> {
    pub fn new(pool: PgPool, transport: T, bridge_key: SigningKey) -> Self {
        Self {
            pool,
            transport,
            key: bridge_key,
        }
    }
    pub fn public_key(&self) -> VerifyingKey {
        self.key.verifying_key()
    }
    /// A new external POST requires the exact acquired effect/epoch. The journal is
    /// committed BEFORE networking, bounding ambiguous replay to 23 hours.
    pub async fn deliver(&self, acquired: &Acquired) -> StripeResult<Observation> {
        require(
            acquired.request.destination == DESTINATION,
            "Stripe destination mismatch",
        )?;
        acquired.request.check_payload(&acquired.payload)?;
        let payment: TestPayment = serde_json::from_slice(&acquired.payload)?;
        payment.validate()?;
        let mut tx = self.pool.begin().await?;
        let row=sqlx::query("SELECT e.state,e.epoch,e.request_json,e.payload,a.id,a.epoch AS attempt_epoch,a.state AS attempt_state FROM ritual_effects e JOIN ritual_attempts a ON a.effect=e.id WHERE e.id=$1 AND a.id=$2 FOR UPDATE OF e,a")
            .bind(acquired.effect.as_slice()).bind(acquired.attempt).fetch_one(&mut *tx).await?;
        require(
            row.get::<String, _>("state") == "dispatched"
                && row.get::<i64, _>("epoch") == acquired.epoch
                && row.get::<i64, _>("attempt_epoch") == acquired.epoch
                && row.get::<String, _>("attempt_state") == "in_flight"
                && row.get::<Value, _>("request_json") == serde_json::to_value(&acquired.request)?
                && row.get::<Vec<u8>, _>("payload") == acquired.payload,
            "Stripe stale or changed dispatch",
        )?;
        let now: i64 =
            sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp()))::bigint")
                .fetch_one(&mut *tx)
                .await?;
        let key = format!("arkhe-effect-v1-{}", hex::encode(acquired.effect));
        sqlx::query("INSERT INTO ritual_stripe_requests(effect,payload_digest,idempotency_key,first_post,post_until) VALUES($1,$2,$3,$4,$5) ON CONFLICT(effect) DO NOTHING")
            .bind(acquired.effect.as_slice()).bind(acquired.request.payload_digest.as_slice()).bind(&key).bind(now).bind(now+POST_WINDOW).execute(&mut *tx).await?;
        let journal=sqlx::query("SELECT payload_digest,idempotency_key,post_until,remote_id FROM ritual_stripe_requests WHERE effect=$1 FOR UPDATE")
            .bind(acquired.effect.as_slice()).fetch_one(&mut *tx).await?;
        require(
            journal.get::<Vec<u8>, _>("payload_digest") == acquired.request.payload_digest
                && journal.get::<String, _>("idempotency_key") == key,
            "Stripe journal content mismatch",
        )?;
        let id: Option<String> = journal.get("remote_id");
        let within_window = now < journal.get::<i64, _>("post_until");
        if id.is_none() && !within_window {
            return Err(StripeError::WindowExpired);
        }
        tx.commit().await?;
        let call = if within_window {
            StripeCall::Create {
                key,
                amount: payment.amount_minor,
                currency: payment.currency.clone(),
                effect: hex::encode(acquired.effect),
                payload: hex::encode(acquired.request.payload_digest),
            }
        } else {
            StripeCall::Retrieve {
                id: id.ok_or(StripeError::WindowExpired)?,
            }
        };
        let response = self.transport.call(call).await?;
        self.observe(
            acquired.effect,
            acquired.request.payload_digest,
            &payment,
            response,
        )
        .await
    }
    /// Retrieve only an already persisted provider ID. No search-by-metadata or
    /// "not found" inference, and no POST, including after the replay window.
    pub async fn lookup(&self, acquired: &Acquired) -> StripeResult<Option<Observation>> {
        acquired.request.check_payload(&acquired.payload)?;
        let payment: TestPayment = serde_json::from_slice(&acquired.payload)?;
        payment.validate()?;
        let id: Option<Option<String>> =
            sqlx::query_scalar("SELECT remote_id FROM ritual_stripe_requests WHERE effect=$1")
                .bind(acquired.effect.as_slice())
                .fetch_optional(&self.pool)
                .await?;
        let Some(Some(id)) = id else {
            return Ok(None);
        };
        let response = self.transport.call(StripeCall::Retrieve { id }).await?;
        self.observe(
            acquired.effect,
            acquired.request.payload_digest,
            &payment,
            response,
        )
        .await
        .map(Some)
    }
    pub async fn lookup_effect(&self, effect: Hash) -> StripeResult<Option<Observation>> {
        let row=sqlx::query("SELECT e.request_json,e.payload,a.id,a.epoch FROM ritual_effects e JOIN ritual_attempts a ON a.effect=e.id WHERE e.id=$1 ORDER BY a.epoch DESC LIMIT 1")
            .bind(effect.as_slice()).fetch_optional(&self.pool).await?;
        let Some(row) = row else {
            return Ok(None);
        };
        self.lookup(&Acquired {
            effect,
            attempt: row.get("id"),
            epoch: row.get("epoch"),
            request: serde_json::from_value(row.get("request_json"))?,
            payload: row.get("payload"),
        })
        .await
    }
    async fn observe(
        &self,
        effect: Hash,
        payload: Hash,
        payment: &TestPayment,
        response: StripeResponse,
    ) -> StripeResult<Observation> {
        if !(200..300).contains(&response.status) {
            return Err(StripeError::Http(response.status));
        }
        let b = &response.body;
        let id = b["id"]
            .as_str()
            .ok_or(StripeError::Protocol("missing PaymentIntent ID"))?;
        if !valid_id(id)
            || b["object"] != "payment_intent"
            || b["livemode"] != false
            || b["amount"].as_u64() != Some(payment.amount_minor as u64)
            || b["currency"] != payment.currency
            || b["metadata"]["arkhe_effect_id"] != hex::encode(effect)
            || b["metadata"]["arkhe_payload_digest"] != hex::encode(payload)
        {
            return Err(StripeError::Protocol(
                "provider identity, mode or payload mismatch",
            ));
        }
        let status = b["status"]
            .as_str()
            .ok_or(StripeError::Protocol("missing status"))?
            .to_owned();
        let success = status == "succeeded"
            && b["amount_received"].as_u64() == Some(payment.amount_minor as u64);
        let evidence = if success {
            let result = digest(
                b"AKG:RITUAL:STRIPE-TEST-RESULT:v1\0",
                &(id, payment.amount_minor, &payment.currency, &status),
            )?;
            Some(Envelope::sign(
                &DestinationEvidence {
                    effect,
                    payload,
                    destination: DESTINATION.into(),
                    result,
                    succeeded: true,
                },
                EVIDENCE,
                &self.key,
            )?)
        } else {
            None
        };
        let observation = Observation {
            payment_intent: id.into(),
            stripe_request_id: response.request_id.clone(),
            status: status.clone(),
            livemode: false,
            amount_minor: payment.amount_minor,
            currency: payment.currency.clone(),
            effect,
            evidence: evidence.clone(),
        };
        // Never replace an earlier ID or regress a confirmed success.
        let n=sqlx::query("UPDATE ritual_stripe_requests SET remote_id=$2,remote_request_id=$3,provider_status=$4,evidence=$5 WHERE effect=$1 AND (remote_id IS NULL OR remote_id=$2) AND (provider_status IS DISTINCT FROM 'succeeded' OR $4='succeeded')")
            .bind(effect.as_slice()).bind(id).bind(response.request_id).bind(status).bind(evidence.map(serde_json::to_value).transpose()?).execute(&self.pool).await?.rows_affected();
        if n != 1 {
            return Err(StripeError::Protocol(
                "provider ID changed or success regressed",
            ));
        }
        Ok(observation)
    }
}
