use crate::{
    crypto::{Envelope, Hash},
    protocol::*,
    require, Error, Result,
};
use ed25519_dalek::{SigningKey, VerifyingKey};
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

pub struct Store {
    pool: PgPool,
    gate: VerifyingKey,
    audit: SigningKey,
    fee: i64,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Accepted {
    New(Hash),
    Existing { effect: Hash, state: String },
}
#[derive(Debug, Clone)]
pub struct Acquired {
    pub effect: Hash,
    pub attempt: Uuid,
    pub epoch: i64,
    pub payload: Vec<u8>,
    pub request: Request,
}
impl Store {
    pub fn new(pool: PgPool, gate: VerifyingKey, audit: SigningKey) -> Self {
        Self {
            pool,
            gate,
            audit,
            fee: 0,
        }
    }
    pub fn with_simulated_fee(mut self, amount: i64) -> Result<Self> {
        require(amount >= 0, "negative fee")?;
        self.fee = amount;
        Ok(self)
    }
    /// Test/admin funding in local units. Does not contact a wallet or token contract.
    pub async fn set_simulated_balance(&self, tenant: Uuid, balance: i64) -> Result<()> {
        require(balance >= 0, "negative balance")?;
        sqlx::query("INSERT INTO ritual_fee_accounts(tenant,balance) VALUES($1,$2) ON CONFLICT(tenant) DO UPDATE SET balance=$2")
            .bind(tenant).bind(balance).execute(&self.pool).await?;
        Ok(())
    }
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
    pub fn audit_key(&self) -> VerifyingKey {
        self.audit.verifying_key()
    }
    /// Host-owned trust configuration, never populated from a receipt.
    pub async fn register_destination(&self, name: &str, key: &VerifyingKey) -> Result<()> {
        sqlx::query("INSERT INTO ritual_destination_keys(destination,public_key) VALUES($1,$2) ON CONFLICT(destination) DO UPDATE SET public_key=$2")
            .bind(name).bind(key.as_bytes().as_slice()).execute(&self.pool).await?;
        Ok(())
    }
    async fn trusted_destination(&self, name: &str, key: &VerifyingKey) -> Result<()> {
        let stored: Option<Vec<u8>> = sqlx::query_scalar(
            "SELECT public_key FROM ritual_destination_keys WHERE destination=$1",
        )
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;
        require(
            stored.as_deref() == Some(key.as_bytes().as_slice()),
            "untrusted destination key",
        )
    }
    pub async fn migrate(&self) -> Result<()> {
        sqlx::migrate!("./migrations").run(&self.pool).await?;
        Ok(())
    }
    pub async fn now(&self) -> Result<i64> {
        Ok(
            sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp()))::bigint")
                .fetch_one(&self.pool)
                .await?,
        )
    }
    /// Administrative host operation; do not expose as an unauthenticated endpoint.
    pub async fn set_policy(&self, policy: Hash, active: bool) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        control(&mut tx).await?;
        sqlx::query("INSERT INTO ritual_policies(digest,active) VALUES($1,$2) ON CONFLICT(digest) DO UPDATE SET active=$2")
            .bind(policy.as_slice()).bind(active).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn emergency_stop(&self, enabled: bool) -> Result<()> {
        sqlx::query("UPDATE ritual_control SET emergency_stop=$1 WHERE singleton")
            .bind(enabled)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
    pub async fn issue_challenge(
        &self,
        tenant: Uuid,
        request: &Request,
        ttl: i64,
    ) -> Result<Challenge> {
        require(
            tenant == request.tenant && ttl > 0 && ttl <= 300,
            "challenge context invalid",
        )?;
        let mut nonce = [0; 32];
        getrandom::getrandom(&mut nonce)
            .map_err(|_| Error::Rejected("secure randomness unavailable"))?;
        let c = Challenge {
            id: Uuid::new_v4(),
            tenant,
            nonce,
            request: request.commitment()?,
            profile: PROFILE.into(),
            expires: self.now().await? + ttl,
        };
        sqlx::query("INSERT INTO ritual_challenges(id,tenant,nonce,request,profile,expires) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(c.id).bind(c.tenant).bind(c.nonce.as_slice()).bind(c.request.as_slice()).bind(&c.profile).bind(c.expires).execute(&self.pool).await?;
        Ok(c)
    }
    // Keep host identity, untrusted artifacts and verifier configuration distinct.
    #[allow(clippy::too_many_arguments)]
    pub async fn accept(
        &self,
        tenant: Uuid,
        request: &Request,
        payload: &[u8],
        challenge: &Challenge,
        bundle: &AnalysisBundle,
        verifier: &MockPlatformVerifier,
        signed_auth: &Envelope,
    ) -> Result<Accepted> {
        require(tenant == request.tenant, "authenticated tenant mismatch")?;
        let now = self.now().await?;
        let analysis = verifier.verify(bundle, challenge, request, payload, now)?;
        let auth: Authorization = signed_auth.open(AUTH, &self.gate)?;
        let effect = request.effect_id()?;
        require(
            auth.allow
                && auth.tenant == tenant
                && auth.challenge == challenge.id
                && auth.request == request.commitment()?
                && auth.effect == effect
                && auth.analysis == analysis.commitment()
                && auth.policy == request.policy
                && auth.profile == PROFILE
                && auth.issued <= now
                && auth.expires > now
                && auth.expires <= challenge.expires
                && auth.expires > auth.issued
                && auth.expires - auth.issued <= 300,
            "gate auth_id mismatch or expired",
        )?;
        let auth_hash = auth.commitment()?;
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query("SELECT * FROM ritual_challenges WHERE id=$1 FOR UPDATE")
            .bind(challenge.id)
            .fetch_one(&mut *tx)
            .await?;
        require(
            row.get::<Uuid, _>("tenant") == tenant
                && row.get::<Vec<u8>, _>("nonce") == challenge.nonce
                && row.get::<Vec<u8>, _>("request") == request.commitment()?
                && row.get::<String, _>("profile") == PROFILE
                && row.get::<i64, _>("expires") == challenge.expires,
            "stored challenge mismatch",
        )?;
        // Replay is authorized only after ALL signatures, payload and tenant checks.
        if let Some(prior) = row.get::<Option<Vec<u8>>, _>("consumed_by") {
            require(
                prior == effect,
                "challenge already consumed by another effect",
            )?;
            let state: String = sqlx::query_scalar("SELECT state FROM ritual_effects WHERE id=$1")
                .bind(effect.as_slice())
                .fetch_one(&mut *tx)
                .await?;
            tx.commit().await?;
            return Ok(Accepted::Existing { effect, state });
        }
        require(
            row.get::<i64, _>("expires") > db_now(&mut tx).await?,
            "challenge expired",
        )?;
        require(!control(&mut tx).await?, "emergency stop")?;
        active_policy(&mut tx, request.policy).await?;
        let inserted = sqlx::query("INSERT INTO ritual_effects(id,tenant,request_json,request,payload,payload_digest,state,auth_id) VALUES($1,$2,$3,$4,$5,$6,'enqueued',$7) ON CONFLICT(id) DO NOTHING")
            .bind(effect.as_slice()).bind(tenant).bind(serde_json::to_value(request)?).bind(auth.request.as_slice()).bind(payload).bind(request.payload_digest.as_slice()).bind(auth.id)
            .execute(&mut *tx).await?.rows_affected();
        let e = sqlx::query(
            "SELECT request_json,payload,state FROM ritual_effects WHERE id=$1 FOR UPDATE",
        )
        .bind(effect.as_slice())
        .fetch_one(&mut *tx)
        .await?;
        require(
            e.get::<serde_json::Value, _>("request_json") == serde_json::to_value(request)?
                && e.get::<Vec<u8>, _>("payload") == payload,
            "effect content mismatch",
        )?;
        if inserted == 0 {
            let state = e.get("state");
            tx.rollback().await?;
            return Ok(Accepted::Existing { effect, state });
        }
        sqlx::query("INSERT INTO ritual_authorizations(id,effect,challenge,analysis,commitment,envelope,analysis_envelope,platform_envelope,issued,expires) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(auth.id).bind(effect.as_slice()).bind(challenge.id).bind(analysis.commitment().as_slice()).bind(auth_hash.as_slice())
            .bind(serde_json::to_value(signed_auth)?).bind(serde_json::to_value(&bundle.statement)?).bind(serde_json::to_value(&bundle.platform)?)
            .bind(auth.issued).bind(auth.expires).execute(&mut *tx).await?;
        let n = sqlx::query("UPDATE ritual_challenges SET consumed_by=$2 WHERE id=$1 AND consumed_by IS NULL AND expires>$3")
            .bind(challenge.id).bind(effect.as_slice()).bind(db_now(&mut tx).await?).execute(&mut *tx).await?.rows_affected();
        require(n == 1, "challenge consumption failed")?;
        sqlx::query("INSERT INTO ritual_outbox(effect,auth_id) VALUES($1,$2)")
            .bind(effect.as_slice())
            .bind(auth.id)
            .execute(&mut *tx)
            .await?;
        if self.fee > 0 {
            let debited = sqlx::query(
                "UPDATE ritual_fee_accounts SET balance=balance-$2 WHERE tenant=$1 AND balance>=$2",
            )
            .bind(tenant)
            .bind(self.fee)
            .execute(&mut *tx)
            .await?
            .rows_affected();
            require(debited == 1, "insufficient simulated fee")?;
            sqlx::query("INSERT INTO ritual_fee_ledger(effect,tenant,amount) VALUES($1,$2,$3)")
                .bind(effect.as_slice())
                .bind(tenant)
                .bind(self.fee)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(Accepted::New(effect))
    }
    /// Dispatch linearizes at the commit of this transaction. An external destination
    /// must deduplicate the effect; DB fencing cannot cancel an already sent call.
    pub async fn acquire(&self, worker: &str, lease_seconds: i64) -> Result<Option<Acquired>> {
        require(
            !worker.is_empty() && lease_seconds > 0 && lease_seconds <= 300,
            "lease invalid",
        )?;
        let mut tx = self.pool.begin().await?;
        if control(&mut tx).await? {
            tx.rollback().await?;
            return Ok(None);
        }
        let now = db_now(&mut tx).await?;
        let rows = sqlx::query("SELECT e.id,e.request_json,e.payload,a.expires FROM ritual_effects e JOIN ritual_authorizations a ON a.id=e.auth_id JOIN ritual_outbox o ON o.effect=e.id AND o.auth_id=a.id WHERE e.state='enqueued' ORDER BY e.id FOR UPDATE OF e SKIP LOCKED LIMIT 1")
            .fetch_optional(&mut *tx).await?;
        let Some(row) = rows else {
            tx.rollback().await?;
            return Ok(None);
        };
        let effect = hash32(row.get("id"))?;
        let request: Request = serde_json::from_value(row.get("request_json"))?;
        if row.get::<i64, _>("expires") <= now || !policy_active(&mut tx, request.policy).await? {
            sqlx::query("UPDATE ritual_effects SET state='cancelled' WHERE id=$1")
                .bind(effect.as_slice())
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;
            return Ok(None);
        }
        let epoch: i64=sqlx::query_scalar("UPDATE ritual_effects SET state='dispatched',epoch=epoch+1 WHERE id=$1 AND state='enqueued' RETURNING epoch")
            .bind(effect.as_slice()).fetch_one(&mut *tx).await?;
        let attempt = Uuid::new_v4();
        sqlx::query("INSERT INTO ritual_attempts(id,effect,auth_id,worker,epoch,lease_until,acquired_at,state) SELECT $1,id,auth_id,$2,$3,$4,$6,'in_flight' FROM ritual_effects WHERE id=$5")
            .bind(attempt).bind(worker).bind(epoch).bind(now+lease_seconds).bind(effect.as_slice()).bind(now).execute(&mut *tx).await?;
        let acquired = Acquired {
            effect,
            attempt,
            epoch,
            payload: row.get("payload"),
            request,
        };
        tx.commit().await?;
        Ok(Some(acquired))
    }
    pub async fn recover_stale(&self, effect: Hash) -> Result<bool> {
        let mut tx = self.pool.begin().await?;
        let e = sqlx::query("SELECT state,epoch FROM ritual_effects WHERE id=$1 FOR UPDATE")
            .bind(effect.as_slice())
            .fetch_one(&mut *tx)
            .await?;
        if e.get::<String, _>("state") != "dispatched" {
            tx.rollback().await?;
            return Ok(false);
        }
        let now = db_now(&mut tx).await?;
        let n=sqlx::query("UPDATE ritual_attempts SET state='unknown' WHERE effect=$1 AND epoch=$2 AND state='in_flight' AND lease_until<=$3")
            .bind(effect.as_slice()).bind(e.get::<i64,_>("epoch")).bind(now).execute(&mut *tx).await?.rows_affected();
        if n == 0 {
            tx.rollback().await?;
            return Ok(false);
        }
        require(n == 1, "multiple current attempts")?;
        sqlx::query("UPDATE ritual_effects SET state='unknown',epoch=epoch+1 WHERE id=$1")
            .bind(effect.as_slice())
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(true)
    }
    pub async fn confirm(
        &self,
        acquired: &Acquired,
        evidence: &Envelope,
        destination_key: &VerifyingKey,
    ) -> Result<Envelope> {
        let json: serde_json::Value =
            sqlx::query_scalar("SELECT request_json FROM ritual_effects WHERE id=$1")
                .bind(acquired.effect.as_slice())
                .fetch_one(&self.pool)
                .await?;
        let request: Request = serde_json::from_value(json)?;
        self.trusted_destination(&request.destination, destination_key)
            .await?;
        let observed = verify_destination(evidence, destination_key, &request, acquired.effect)?;
        self.finish(
            acquired.effect,
            Some((acquired.attempt, acquired.epoch)),
            observed,
        )
        .await
    }
    /// Reconciliation observes an existing destination result; it NEVER sends again.
    pub async fn reconcile(
        &self,
        effect: Hash,
        evidence: &Envelope,
        destination_key: &VerifyingKey,
    ) -> Result<Envelope> {
        let json: serde_json::Value =
            sqlx::query_scalar("SELECT request_json FROM ritual_effects WHERE id=$1")
                .bind(effect.as_slice())
                .fetch_one(&self.pool)
                .await?;
        let request: Request = serde_json::from_value(json)?;
        self.trusted_destination(&request.destination, destination_key)
            .await?;
        let observed = verify_destination(evidence, destination_key, &request, effect)?;
        self.finish(effect, None, observed).await
    }
    /// Retry is deliberately restricted to our durable, effect-keyed destination.
    /// An arbitrary capability flag or a "not found" response is insufficient.
    /// Returns false when an already committed result was reconciled instead.
    #[allow(clippy::too_many_arguments)]
    pub async fn retry_unknown(
        &self,
        tenant: Uuid,
        request: &Request,
        payload: &[u8],
        challenge: &Challenge,
        bundle: &AnalysisBundle,
        verifier: &MockPlatformVerifier,
        signed_auth: &Envelope,
        destination: &crate::destination::DatabaseDestination,
    ) -> Result<bool> {
        require(
            tenant == request.tenant && destination.name() == request.destination,
            "retry context mismatch",
        )?;
        self.trusted_destination(destination.name(), &destination.public_key())
            .await?;
        let effect = request.effect_id()?;
        if let Some(evidence) = destination.lookup(effect).await? {
            self.reconcile(effect, &evidence, &destination.public_key())
                .await?;
            return Ok(false);
        }
        let now = self.now().await?;
        let analysis = verifier.verify(bundle, challenge, request, payload, now)?;
        let auth: Authorization = signed_auth.open(AUTH, &self.gate)?;
        require(
            auth.allow
                && auth.effect == effect
                && auth.tenant == tenant
                && auth.challenge == challenge.id
                && auth.request == request.commitment()?
                && auth.analysis == analysis.commitment()
                && auth.policy == request.policy
                && auth.profile == PROFILE
                && auth.issued <= now
                && auth.expires > now
                && auth.expires <= challenge.expires
                && auth.expires > auth.issued
                && auth.expires - auth.issued <= 300,
            "retry authorization invalid",
        )?;
        let mut tx = self.pool.begin().await?;
        let c = sqlx::query("SELECT * FROM ritual_challenges WHERE id=$1 FOR UPDATE")
            .bind(challenge.id)
            .fetch_one(&mut *tx)
            .await?;
        require(
            c.get::<Uuid, _>("tenant") == tenant
                && c.get::<Vec<u8>, _>("nonce") == challenge.nonce
                && c.get::<Vec<u8>, _>("request") == request.commitment()?
                && c.get::<String, _>("profile") == PROFILE
                && c.get::<i64, _>("expires") == challenge.expires
                && c.get::<Option<Vec<u8>>, _>("consumed_by").is_none(),
            "retry challenge mismatch",
        )?;
        require(!control(&mut tx).await?, "emergency stop")?;
        active_policy(&mut tx, request.policy).await?;
        let e = sqlx::query(
            "SELECT state,auth_id,request_json,payload FROM ritual_effects WHERE id=$1 FOR UPDATE",
        )
        .bind(effect.as_slice())
        .fetch_one(&mut *tx)
        .await?;
        require(
            e.get::<String, _>("state") == "unknown" && e.get::<Uuid, _>("auth_id") != auth.id,
            "retry requires unknown and fresh authorization",
        )?;
        require(
            e.get::<serde_json::Value, _>("request_json") == serde_json::to_value(request)?
                && e.get::<Vec<u8>, _>("payload") == payload,
            "retry content mismatch",
        )?;
        require(
            auth.expires > db_now(&mut tx).await?,
            "retry authorization expired",
        )?;
        sqlx::query("INSERT INTO ritual_authorizations(id,effect,challenge,analysis,commitment,envelope,analysis_envelope,platform_envelope,issued,expires) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(auth.id).bind(effect.as_slice()).bind(challenge.id).bind(analysis.commitment().as_slice()).bind(auth.commitment()?.as_slice())
            .bind(serde_json::to_value(signed_auth)?).bind(serde_json::to_value(&bundle.statement)?).bind(serde_json::to_value(&bundle.platform)?)
            .bind(auth.issued).bind(auth.expires).execute(&mut *tx).await?;
        sqlx::query("UPDATE ritual_challenges SET consumed_by=$2 WHERE id=$1")
            .bind(challenge.id)
            .bind(effect.as_slice())
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "UPDATE ritual_effects SET state='enqueued',epoch=epoch+1,auth_id=$2 WHERE id=$1",
        )
        .bind(effect.as_slice())
        .bind(auth.id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE ritual_outbox SET auth_id=$2 WHERE effect=$1")
            .bind(effect.as_slice())
            .bind(auth.id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(true)
    }
    async fn finish(
        &self,
        effect: Hash,
        expected: Option<(Uuid, i64)>,
        observed: DestinationEvidence,
    ) -> Result<Envelope> {
        let mut tx = self.pool.begin().await?;
        let e = sqlx::query(
            "SELECT state,epoch,auth_id,receipt FROM ritual_effects WHERE id=$1 FOR UPDATE",
        )
        .bind(effect.as_slice())
        .fetch_one(&mut *tx)
        .await?;
        let state: String = e.get("state");
        if state == "confirmed" {
            let stored: Envelope = serde_json::from_value(e.get("receipt"))?;
            let prior: ExecutionReceipt = stored.open(RECEIPT, &self.audit.verifying_key())?;
            require(prior.evidence == observed, "conflicting confirmation")?;
            tx.commit().await?;
            return Ok(stored);
        }
        require(
            if expected.is_some() {
                state == "dispatched"
            } else {
                state == "unknown"
            },
            "effect not eligible for confirmation",
        )?;
        let attempt=sqlx::query("SELECT id,epoch,state,acquired_at FROM ritual_attempts WHERE effect=$1 ORDER BY epoch DESC LIMIT 1 FOR UPDATE")
            .bind(effect.as_slice()).fetch_one(&mut *tx).await?;
        let id: Uuid = attempt.get("id");
        let epoch: i64 = attempt.get("epoch");
        if let Some((expected_id, expected_epoch)) = expected {
            require(
                expected_id == id
                    && expected_epoch == epoch
                    && epoch == e.get::<i64, _>("epoch")
                    && attempt.get::<String, _>("state") == "in_flight",
                "stale worker",
            )?;
        } else {
            require(
                attempt.get::<String, _>("state") == "unknown",
                "attempt not unknown",
            )?;
        }
        let auth = sqlx::query(
            "SELECT commitment,analysis,envelope FROM ritual_authorizations WHERE id=$1",
        )
        .bind(e.get::<Uuid, _>("auth_id"))
        .fetch_one(&mut *tx)
        .await?;
        let signed_auth: Envelope = serde_json::from_value(auth.get("envelope"))?;
        let authorization: Authorization = signed_auth.open(AUTH, &self.gate)?;
        let receipt = ExecutionReceipt {
            effect,
            attempt: id,
            epoch,
            authorization: hash32(auth.get("commitment"))?,
            analysis: hash32(auth.get("analysis"))?,
            policy: authorization.policy,
            evidence: observed,
            dispatched_at: attempt.get("acquired_at"),
            observed_at: db_now(&mut tx).await?,
        };
        let envelope = Envelope::sign(&receipt, RECEIPT, &self.audit)?;
        sqlx::query("UPDATE ritual_attempts SET state='confirmed' WHERE id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "UPDATE ritual_effects SET state='confirmed',receipt=$2,receipt_digest=$3 WHERE id=$1",
        )
        .bind(effect.as_slice())
        .bind(serde_json::to_value(&envelope)?)
        .bind(receipt.commitment()?.as_slice())
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(envelope)
    }
}
async fn control(tx: &mut Transaction<'_, Postgres>) -> Result<bool> {
    Ok(
        sqlx::query_scalar("SELECT emergency_stop FROM ritual_control WHERE singleton FOR UPDATE")
            .fetch_one(&mut **tx)
            .await?,
    )
}
async fn db_now(tx: &mut Transaction<'_, Postgres>) -> Result<i64> {
    Ok(
        sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp()))::bigint")
            .fetch_one(&mut **tx)
            .await?,
    )
}
async fn policy_active(tx: &mut Transaction<'_, Postgres>, policy: Hash) -> Result<bool> {
    Ok(sqlx::query_scalar(
        "SELECT COALESCE((SELECT active FROM ritual_policies WHERE digest=$1),FALSE)",
    )
    .bind(policy.as_slice())
    .fetch_one(&mut **tx)
    .await?)
}
async fn active_policy(tx: &mut Transaction<'_, Postgres>, policy: Hash) -> Result<()> {
    require(policy_active(tx, policy).await?, "policy inactive")
}
fn hash32(bytes: Vec<u8>) -> Result<Hash> {
    bytes
        .try_into()
        .map_err(|_| Error::Rejected("invalid digest length"))
}
fn verify_destination(
    envelope: &Envelope,
    key: &VerifyingKey,
    request: &Request,
    effect: Hash,
) -> Result<DestinationEvidence> {
    let e: DestinationEvidence = envelope.open(crate::destination::EVIDENCE, key)?;
    require(
        e.succeeded
            && e.effect == effect
            && e.payload == request.payload_digest
            && e.destination == request.destination,
        "destination evidence mismatch",
    )?;
    Ok(e)
}
