//! Anchors verified CustodyTransfers in the evidence log. The envelope's
//! `payload_digest` binds the canonical transfer and both signatures; its
//! causal parent is the previous transfer, so a store that enforces parents
//! (Postgres) refuses a transfer whose predecessor it has not admitted.
//!
//! The predecessor check below is advisory and racy. Linearity is enforced by
//! the store: Postgres has unique indexes allowing one successor per transfer
//! and one first transfer per asset, so concurrent forks fail atomically. The
//! in-memory `WormGraph` has no such index and accepts forks; chain
//! verification still rejects them.
use arkhe_core::{
    custody::CustodyTransfer,
    evidence::{EvidenceCommitter, EvidenceEnvelope, EvidenceReader},
    CanonicalEncode, Digest32,
};
use arkhe_verify_core::custody::SignedTransfer;

pub const CUSTODY_KIND: &str = "CustodyTransfer";

pub fn custody_envelope(t: &CustodyTransfer, signed: &SignedTransfer) -> EvidenceEnvelope {
    let payload = [
        signed.transfer_cbor.as_bytes(),
        b"\0",
        signed.releasing_signature.as_bytes(),
        b"\0",
        signed.receiving_signature.as_bytes(),
    ]
    .concat();
    EvidenceEnvelope {
        record_hash: t.object_digest(),
        kind: CUSTODY_KIND.into(),
        subject: CustodyTransfer::asset_subject(&t.asset_id),
        payload_digest: Digest32::blake3(b"AKG:CUSTODY:SIGNED:v1\0", &payload),
        policy_digest: None,
        causal_parents: t.prev_transfer.into_iter().collect(),
    }
}

/// Verify signatures, require the predecessor to be a stored transfer of the
/// same asset, then commit. Returns the transfer digest.
pub async fn record_transfer<S>(store: &S, signed: &SignedTransfer) -> Result<Digest32, String>
where
    S: EvidenceReader + EvidenceCommitter + ?Sized,
{
    let t = signed.verify()?;
    if let Some(prev) = t.prev_transfer {
        let parent = store
            .get(prev)
            .await?
            .ok_or("previous transfer is not in the evidence log")?;
        if parent.kind != CUSTODY_KIND
            || parent.subject != CustodyTransfer::asset_subject(&t.asset_id)
        {
            return Err("previous record is not a transfer of this asset".into());
        }
    }
    store.append_verified(custody_envelope(&t, signed)).await
}
