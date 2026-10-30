//! Durable test destination. The INSERT itself is the simulated protected effect.
//! A real adapter must atomically commit its actual effect with the deduplication row.
use crate::{
    crypto::{digest, Envelope, Hash},
    protocol::{DestinationEvidence, Request},
    require, Result,
};
use ed25519_dalek::{SigningKey, VerifyingKey};
use sqlx::{PgPool, Row};
pub const EVIDENCE: &[u8] = b"AKG:RITUAL:DESTINATION-EVIDENCE:v1\0";
pub struct DatabaseDestination {
    pool: PgPool,
    name: String,
    key: SigningKey,
}
impl DatabaseDestination {
    pub fn new(pool: PgPool, name: String, key: SigningKey) -> Self {
        Self { pool, name, key }
    }
    pub fn public_key(&self) -> VerifyingKey {
        self.key.verifying_key()
    }
    pub fn name(&self) -> &str {
        &self.name
    }
    pub async fn deliver(&self, request: &Request, payload: &[u8]) -> Result<Envelope> {
        require(request.destination == self.name, "destination mismatch")?;
        request.check_payload(payload)?;
        let effect = request.effect_id()?;
        let result = digest(
            b"AKG:RITUAL:SIMULATED-EFFECT:v1\0",
            &(effect, request.payload_digest),
        )?;
        let evidence = DestinationEvidence {
            effect,
            payload: request.payload_digest,
            destination: self.name.clone(),
            result,
            succeeded: true,
        };
        let signed = Envelope::sign(&evidence, EVIDENCE, &self.key)?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO ritual_destination_receipts(destination,effect,payload_digest,evidence,executions,deliveries) VALUES($1,$2,$3,$4,1,0) ON CONFLICT(destination,effect) DO NOTHING")
            .bind(&self.name).bind(effect.as_slice()).bind(request.payload_digest.as_slice()).bind(serde_json::to_value(&signed)?).execute(&mut *tx).await?;
        let row=sqlx::query("SELECT payload_digest,evidence FROM ritual_destination_receipts WHERE destination=$1 AND effect=$2 FOR UPDATE")
            .bind(&self.name).bind(effect.as_slice()).fetch_one(&mut *tx).await?;
        require(
            row.get::<Vec<u8>, _>("payload_digest") == request.payload_digest,
            "effect payload conflict",
        )?;
        let stored = serde_json::from_value(row.get("evidence"))?;
        sqlx::query("UPDATE ritual_destination_receipts SET deliveries=deliveries+1 WHERE destination=$1 AND effect=$2")
            .bind(&self.name).bind(effect.as_slice()).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(stored)
    }
    pub async fn lookup(&self, effect: Hash) -> Result<Option<Envelope>> {
        let row: Option<serde_json::Value> = sqlx::query_scalar(
            "SELECT evidence FROM ritual_destination_receipts WHERE destination=$1 AND effect=$2",
        )
        .bind(&self.name)
        .bind(effect.as_slice())
        .fetch_optional(&self.pool)
        .await?;
        row.map(serde_json::from_value)
            .transpose()
            .map_err(Into::into)
    }
}
