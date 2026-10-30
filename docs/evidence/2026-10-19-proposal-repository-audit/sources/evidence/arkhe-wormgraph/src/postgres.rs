//! Persistent, tenant-scoped implementation. Callers own evidence admission;
//! this store does not convert untrusted input into verified evidence.
use arkhe_core::{
    evidence::{EvidenceCommitter, EvidenceEnvelope, EvidenceReader, WorkEvidenceCommitter},
    work::WorkIntent,
    worker::WorkerExecutionRecord,
    CanonicalEncode, Digest32,
};
use async_trait::async_trait;
use sqlx::{postgres::PgPoolOptions, PgPool, Postgres, Transaction};

pub struct PgWormGraph {
    pool: PgPool,
    tenant: String,
}
impl PgWormGraph {
    /// Deployment-only entry point. Runtime requests never run migrations.
    pub async fn migrate(url: &str) -> Result<(), String> {
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(url)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::migrate!("../../storage/sql/migrations")
            .run(&pool)
            .await
            .map_err(|e| e.to_string())?;
        pool.close().await;
        Ok(())
    }
    pub async fn connect(url: &str, tenant: &str) -> Result<Self, String> {
        if tenant.trim().is_empty() {
            return Err("tenant is required".into());
        }
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .connect(url)
            .await
            .map_err(|e| e.to_string())?;
        let privileged: bool = sqlx::query_scalar(
            "SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = current_user"
        ).fetch_one(&pool).await.map_err(|e| e.to_string())?;
        if privileged {
            return Err(
                "runtime database role must not have administrative or RLS-bypass privileges"
                    .into(),
            );
        }
        let graph = Self {
            pool,
            tenant: tenant.into(),
        };
        // Check role memberships, schema availability, and tenant context before serving.
        for role in ["arkhe_append", "arkhe_read"] {
            let mut tx = graph.begin(role).await?;
            sqlx::query("SELECT record_hash FROM wormgraph_records LIMIT 0")
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            tx.commit().await.map_err(|e| e.to_string())?;
        }
        Ok(graph)
    }
    async fn begin(&self, role: &str) -> Result<Transaction<'_, Postgres>, String> {
        let mut tx = self.pool.begin().await.map_err(|e| e.to_string())?;
        let stmt = match role {
            "arkhe_append" => "SET LOCAL ROLE arkhe_append",
            "arkhe_read" => "SET LOCAL ROLE arkhe_read",
            _ => return Err("invalid storage role".into()),
        };
        sqlx::query(stmt)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        arkhe_sql::tenant::set_tenant(&mut tx, &self.tenant)
            .await
            .map_err(|e| e.to_string())?;
        Ok(tx)
    }
    pub async fn health(&self) -> Result<(), String> {
        let mut tx = self.begin("arkhe_read").await?;
        sqlx::query("SELECT record_hash FROM wormgraph_records LIMIT 0")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())
    }
    pub async fn canonical_object(
        &self,
        kind: &str,
        digest: Digest32,
    ) -> Result<Option<Vec<u8>>, String> {
        let mut tx = self.begin("arkhe_read").await?;
        let result = sqlx::query_scalar("SELECT canonical_bytes FROM work_objects WHERE tenant_id=$1 AND object_type=$2 AND object_digest=$3")
            .bind(&self.tenant).bind(kind).bind(digest.0.to_vec())
            .fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(result)
    }
    async fn require_parents(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        refs: &[Digest32],
    ) -> Result<(), String> {
        for parent in refs {
            let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM wormgraph_records WHERE tenant_id=$1 AND record_hash=$2)")
                .bind(&self.tenant).bind(parent.0.to_vec()).fetch_one(&mut **tx)
                .await.map_err(|e| e.to_string())?;
            if !exists {
                return Err("evidence parent is not readable in this tenant".into());
            }
        }
        Ok(())
    }
    async fn insert_envelope(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        evidence: &EvidenceEnvelope,
    ) -> Result<(), String> {
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!("arkhe:wormgraph:{}", self.tenant))
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        self.require_parents(tx, &evidence.causal_parents).await?;
        let json = serde_json::to_value(evidence).map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO wormgraph_records(tenant_id,record_hash,envelope) VALUES($1,$2,$3) ON CONFLICT (tenant_id,record_hash) DO NOTHING")
            .bind(&self.tenant).bind(evidence.record_hash.0.to_vec()).bind(&json)
            .execute(&mut **tx).await.map_err(|e| e.to_string())?;
        let stored: serde_json::Value = sqlx::query_scalar(
            "SELECT envelope FROM wormgraph_records WHERE tenant_id=$1 AND record_hash=$2",
        )
        .bind(&self.tenant)
        .bind(evidence.record_hash.0.to_vec())
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
        if stored != json {
            return Err("same record_hash bound to different envelope".into());
        }
        Ok(())
    }
    /// Only a trusted admission verifier may call this after provenance checks.
    /// Canonical WER and envelope commit atomically and idempotently.
    pub async fn commit_verified_worker(
        &self,
        worker: &WorkerExecutionRecord,
    ) -> Result<Digest32, String> {
        let hash = worker.digest();
        let evidence = EvidenceEnvelope {
            record_hash: hash,
            kind: "WorkerExecutionRecord".into(),
            subject: worker.input_digest,
            payload_digest: hash,
            policy_digest: None,
            causal_parents: worker.evidence_refs.clone(),
        };
        let mut tx = self.begin("arkhe_append").await?;
        self.insert_object(&mut tx, "WorkerExecutionRecord", worker)
            .await?;
        self.insert_envelope(&mut tx, &evidence).await?;
        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(hash)
    }
    async fn insert_object<T: CanonicalEncode>(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        kind: &str,
        object: &T,
    ) -> Result<(), String> {
        let bytes = object.canonical_bytes();
        let digest = object.object_digest();
        sqlx::query("INSERT INTO work_objects(tenant_id,object_type,object_digest,canonical_bytes) VALUES($1,$2,$3,$4) ON CONFLICT (tenant_id,object_type,object_digest) DO NOTHING")
            .bind(&self.tenant).bind(kind).bind(digest.0.to_vec()).bind(&bytes)
            .execute(&mut **tx).await.map_err(|e| e.to_string())?;
        let stored: Vec<u8> = sqlx::query_scalar("SELECT canonical_bytes FROM work_objects WHERE tenant_id=$1 AND object_type=$2 AND object_digest=$3")
            .bind(&self.tenant).bind(kind).bind(digest.0.to_vec())
            .fetch_one(&mut **tx).await.map_err(|e| e.to_string())?;
        if stored != bytes {
            return Err("object digest already bound to different canonical bytes".into());
        }
        Ok(())
    }
}
#[async_trait]
impl EvidenceReader for PgWormGraph {
    async fn get(&self, hash: Digest32) -> Result<Option<EvidenceEnvelope>, String> {
        let mut tx = self.begin("arkhe_read").await?;
        let value: Option<serde_json::Value> = sqlx::query_scalar(
            "SELECT envelope FROM wormgraph_records WHERE tenant_id=$1 AND record_hash=$2",
        )
        .bind(&self.tenant)
        .bind(hash.0.to_vec())
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
        let envelope: Option<EvidenceEnvelope> = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|e| e.to_string())?;
        if envelope.as_ref().is_some_and(|e| e.record_hash != hash) {
            return Err("stored envelope has inconsistent record hash".into());
        }
        Ok(envelope)
    }
}
#[async_trait]
impl EvidenceCommitter for PgWormGraph {
    async fn append_verified(&self, evidence: EvidenceEnvelope) -> Result<Digest32, String> {
        let mut tx = self.begin("arkhe_append").await?;
        self.insert_envelope(&mut tx, &evidence).await?;
        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(evidence.record_hash)
    }
}
#[async_trait]
impl WorkEvidenceCommitter for PgWormGraph {
    async fn commit_work(
        &self,
        intent: &WorkIntent,
        worker: &WorkerExecutionRecord,
        evidence: EvidenceEnvelope,
    ) -> Result<Digest32, String> {
        if worker.input_digest != intent.digest()
            || evidence.kind != "work-authorization"
            || evidence.subject != intent.digest()
            || evidence.payload_digest != worker.digest()
            || evidence.policy_digest.is_none()
            || evidence.causal_parents != worker.evidence_refs
        {
            return Err("inconsistent work admission".into());
        }
        let mut tx = self.begin("arkhe_append").await?;
        self.require_parents(&mut tx, &intent.context_refs).await?;
        self.insert_object(&mut tx, "WorkIntent", intent).await?;
        self.insert_object(&mut tx, "WorkerExecutionRecord", worker)
            .await?;
        self.insert_envelope(&mut tx, &evidence).await?;
        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(evidence.record_hash)
    }
}
