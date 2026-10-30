//! Offline membership uses the existing Arkhe MMR profile and SignedCheckpoint.
//! Checkpoint time is an issuer assertion, not a timestamp authority.
use crate::{
    crypto::{Envelope, Hash},
    protocol::{Authorization, ExecutionReceipt, AUTH, RECEIPT},
    require, Error, Result,
};
use arkhe_core::Digest32;
use arkhe_verify_core::mmr::profile::PROFILE_DIGEST_HEX;
use arkhe_verify_core::mmr::{build_root_and_proof, verify_proof_at, ProofStep};
use arkhe_wormgraph::{
    anchor::{CheckpointTrust, SignedCheckpoint},
    regenerate::{rebuild, CheckpointBinding},
};
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InclusionPackage {
    pub checkpoint: SignedCheckpoint,
    pub position: u64,
    pub record: Hash,
    pub proof: Vec<ProofStep>,
    pub receipt: Envelope,
    pub authorization: Envelope,
}
/// Experimental SQL-backed append log, with serialization shared with admission.
/// Host must protect DB permissions; signed checkpoints do not prevent a malicious
/// signer from issuing conflicting histories. Gossip/external witnessing is separate.
pub async fn append_receipt(
    pool: &PgPool,
    tenant: Uuid,
    effect: Hash,
    log_id: Hash,
    checkpoint_key: &SigningKey,
    audit_key: &VerifyingKey,
) -> Result<InclusionPackage> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT singleton FROM ritual_control WHERE singleton FOR UPDATE")
        .fetch_one(&mut *tx)
        .await?;
    let row = sqlx::query(
        "SELECT tenant,state,receipt,auth_id FROM ritual_effects WHERE id=$1 FOR UPDATE",
    )
    .bind(effect.as_slice())
    .fetch_one(&mut *tx)
    .await?;
    require(
        row.get::<Uuid, _>("tenant") == tenant && row.get::<String, _>("state") == "confirmed",
        "unconfirmed or foreign effect",
    )?;
    let signed: Envelope = serde_json::from_value(row.get("receipt"))?;
    let receipt: ExecutionReceipt = signed.open(RECEIPT, audit_key)?;
    let auth_json: serde_json::Value =
        sqlx::query_scalar("SELECT envelope FROM ritual_authorizations WHERE id=$1")
            .bind(row.get::<Uuid, _>("auth_id"))
            .fetch_one(&mut *tx)
            .await?;
    let authorization = serde_json::from_value(auth_json)?;
    let record = receipt.commitment()?;
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM ritual_log_leaves WHERE tenant=$1")
        .bind(tenant)
        .fetch_one(&mut *tx)
        .await?;
    require(n < 100_000, "log export limit")?;
    sqlx::query("INSERT INTO ritual_log_leaves(tenant,position,effect,record_hash) VALUES($1,$2,$3,$4) ON CONFLICT(tenant,effect) DO NOTHING")
        .bind(tenant).bind(n).bind(effect.as_slice()).bind(record.as_slice()).execute(&mut *tx).await?;
    let rows=sqlx::query("SELECT effect,position,record_hash FROM ritual_log_leaves WHERE tenant=$1 ORDER BY position").bind(tenant).fetch_all(&mut *tx).await?;
    let mut target = None;
    let mut records = Vec::new();
    for (i, r) in rows.iter().enumerate() {
        require(r.get::<i64, _>("position") == i as i64, "noncontiguous log")?;
        let bytes: Vec<u8> = r.get("record_hash");
        let h: Hash = bytes
            .try_into()
            .map_err(|_| Error::Rejected("log digest length"))?;
        if r.get::<Vec<u8>, _>("effect") == effect {
            require(h == record, "stored receipt hash mismatch")?;
            target = Some(i);
        }
        records.push(Digest32(h));
    }
    let target = target.ok_or(Error::Rejected("record absent"))?;
    let snapshot = rebuild(&records).map_err(|_| Error::Rejected("MMR regeneration failed"))?;
    let leaves: Vec<Vec<u8>> = records.iter().map(|h| h.0.to_vec()).collect();
    let (root, proof) =
        build_root_and_proof(&leaves, target).map_err(|_| Error::Rejected("MMR proof failed"))?;
    require(root == snapshot.root.0, "MMR profile mismatch")?;
    let profile: Hash = hex::decode(PROFILE_DIGEST_HEX)
        .map_err(|_| Error::Rejected("profile hex"))?
        .try_into()
        .map_err(|_| Error::Rejected("profile length"))?;
    let binding = CheckpointBinding {
        tenant_id: tenant.to_string(),
        stream_id: "ritual-receipts-v1".into(),
        leaf_count: snapshot.leaf_count,
        mmr_size: snapshot.mmr_size,
        root: snapshot.root,
        peaks: snapshot.peaks,
        profile_digest: Digest32(profile),
        covered_up_to: *records.last().ok_or(Error::Rejected("empty log"))?,
    };
    let now: i64 =
        sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp()))::bigint")
            .fetch_one(&mut *tx)
            .await?;
    let mut checkpoint =
        SignedCheckpoint::from_binding(&binding, log_id, now as u64, String::new());
    checkpoint.signature_hex =
        hex::encode(checkpoint_key.sign(&checkpoint.signing_bytes()).to_bytes());
    tx.commit().await?;
    Ok(InclusionPackage {
        checkpoint,
        position: target as u64,
        record,
        proof,
        receipt: signed,
        authorization,
    })
}
pub fn verify(
    package: &InclusionPackage,
    trust: &CheckpointTrust,
    audit_key: &VerifyingKey,
) -> Result<()> {
    package
        .checkpoint
        .verify(&package.checkpoint.binding(), trust)
        .map_err(|_| Error::Rejected("checkpoint untrusted"))?;
    require(
        package.checkpoint.leaf_count <= 100_000 && package.proof.len() <= 128,
        "proof limits",
    )?;
    require(
        package.position < package.checkpoint.leaf_count,
        "proof position out of range",
    )?;
    let receipt: ExecutionReceipt = package.receipt.open(RECEIPT, audit_key)?;
    require(
        receipt.commitment()? == package.record,
        "receipt record mismatch",
    )?;
    let valid = verify_proof_at(
        &package.record,
        package.checkpoint.leaf_count as usize,
        package.position as usize,
        &package.proof,
        &package.checkpoint.root,
    )
    .map_err(|_| Error::Rejected("invalid proof"))?;
    require(valid, "inclusion root mismatch")
}
/// Verify signed gate authorization separately from membership. Policy revocation
/// at dispatch is attested by the trusted dispatch service, not by the MMR.
pub fn verify_authorization(
    package: &InclusionPackage,
    trust: &CheckpointTrust,
    audit_key: &VerifyingKey,
    gate_key: &VerifyingKey,
) -> Result<()> {
    verify(package, trust, audit_key)?;
    let receipt: ExecutionReceipt = package.receipt.open(RECEIPT, audit_key)?;
    let auth: Authorization = package.authorization.open(AUTH, gate_key)?;
    require(
        auth.allow
            && auth.commitment()? == receipt.authorization
            && auth.effect == receipt.effect
            && auth.analysis == receipt.analysis
            && auth.policy == receipt.policy
            && auth.tenant.to_string() == trust.tenant_id
            && auth.issued <= receipt.dispatched_at
            && receipt.dispatched_at < auth.expires,
        "offline authorization mismatch",
    )
}
