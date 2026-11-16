//! Offline export of one attestation receipt and its registry MMR inclusion proof.
//!
//! Local verification uses [`arkhe_verify_core::rbb::mmr`]. External trust roots
//! Bitcoin mainnet broadcast and Hippius are not implemented. Recorded Rekor
//! witnesses verify offline; stubs and absent anchors fail closed.

use crate::attest::{AttestRegistry, Receipt};
use crate::rekor_witness::{verify_recorded_witness, RekorInclusionWitness};
use crate::error::ChainError;
use arkhe_core::Digest32;
use arkhe_verify_core::rbb::mmr::{self, Proof};
use serde::{Deserialize, Serialize};

/// Supported bundle schema. Bump when breaking serialized fields.
pub const OFFLINE_BUNDLE_VERSION: u32 = 1;

pub const OFFLINE_BUNDLE_DOMAIN: &[u8] = b"AKG:OFFLINE:VERIFY:v1\0";

/// Registry tip the verifier must obtain through an independent channel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RegistryCheckpoint {
    pub root: [u8; 32],
    pub leaf_count: u64,
}

/// MMR inclusion of one registry leaf (attestation or receipt record).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AuditInclusionProof {
    pub proof: Proof,
    pub leaf_record: [u8; 32],
}

/// Portable receipt fields for JSON/CBOR export. Semantics match [`Receipt`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BundleReceipt {
    pub approval: [u8; 32],
    pub evaluation: [u8; 32],
    pub artifact: [u8; 32],
    pub action: [u8; 32],
    pub height: u64,
    pub leaf: u64,
}

impl From<&Receipt> for BundleReceipt {
    fn from(value: &Receipt) -> Self {
        Self {
            approval: value.approval,
            evaluation: value.evaluation,
            artifact: value.artifact,
            action: value.action,
            height: value.height,
            leaf: value.leaf,
        }
    }
}

impl BundleReceipt {
    fn to_receipt(&self) -> Receipt {
        Receipt {
            approval: self.approval,
            evaluation: self.evaluation,
            artifact: self.artifact,
            action: self.action,
            height: self.height,
            leaf: self.leaf,
        }
    }

    pub fn record(&self) -> [u8; 32] {
        self.to_receipt().record()
    }
}

/// External anchoring is optional metadata. None of these variants close F2/F3.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ExternalAnchoringProof {
    /// No public transparency log or broadcast proof is attached.
    Absent,
    /// Same naming convention as the learn-slice `rekor:dryrun:` stub. Documents
    /// intent only; does not verify against a real Rekor witness.
    RekorDryrunStub {
        trust_root_id: String,
    },
    /// Shape checked by [`crate::anchor`]; `broadcast` must be false in this crate.
    BtcOpReturnPlan {
        op_return: Vec<u8>,
        broadcast: bool,
    },
    /// RFC 6962 inclusion witness against a public Rekor log (recorded or fetched).
    RekorWitness {
        witness: RekorInclusionWitness,
    },
}

/// Alias used in production-binary #3 documentation.
pub type AuditBundle = OfflineVerificationBundle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OfflineVerificationBundle {
    pub version: u32,
    pub chain_id: String,
    pub genesis: [u8; 32],
    pub policy_digest: [u8; 32],
    pub receipt: BundleReceipt,
    pub checkpoint: RegistryCheckpoint,
    pub inclusion: AuditInclusionProof,
    pub external: ExternalAnchoringProof,
}

impl OfflineVerificationBundle {
    /// Build from the registry tip after an approval was executed. Does not anchor externally.
    pub fn from_registry(
        reg: &AttestRegistry,
        approval: &[u8; 32],
        external: ExternalAnchoringProof,
    ) -> Result<Self, ChainError> {
        let receipt = reg.receipt(approval).ok_or(ChainError::Attest("unknown"))?;
        let leaf = receipt.leaf;
        let (proof, leaf_record, root) = reg.inclusion_proof(leaf)?;
        if leaf_record != receipt.record() {
            return Err(ChainError::Mmr);
        }
        Ok(Self {
            version: OFFLINE_BUNDLE_VERSION,
            chain_id: reg.chain_id().to_string(),
            genesis: *reg.genesis(),
            policy_digest: reg.policy_digest(),
            receipt: BundleReceipt::from(receipt),
            checkpoint: RegistryCheckpoint {
                root,
                leaf_count: reg.count(),
            },
            inclusion: AuditInclusionProof {
                proof,
                leaf_record,
            },
            external,
        })
    }

    /// Typed commitment over bundle fields (excludes `external` anchoring metadata).
    pub fn digest(&self) -> [u8; 32] {
        #[derive(Serialize)]
        struct Body<'a> {
            version: u32,
            chain_id: &'a str,
            genesis: [u8; 32],
            policy_digest: [u8; 32],
            receipt: &'a BundleReceipt,
            checkpoint: &'a RegistryCheckpoint,
            inclusion: &'a AuditInclusionProof,
        }
        let body = Body {
            version: self.version,
            chain_id: &self.chain_id,
            genesis: self.genesis,
            policy_digest: self.policy_digest,
            receipt: &self.receipt,
            checkpoint: &self.checkpoint,
            inclusion: &self.inclusion,
        };
        let bytes = serde_json::to_vec(&body).unwrap_or_default();
        Digest32::blake3(OFFLINE_BUNDLE_DOMAIN, &bytes).0
    }

    /// Verify receipt record and MMR inclusion against a trusted checkpoint.
    pub fn verify_inclusion(&self, trusted: &RegistryCheckpoint) -> Result<(), ChainError> {
        if self.version != OFFLINE_BUNDLE_VERSION {
            return Err(ChainError::AuditBundle("version"));
        }
        if self.checkpoint.root != trusted.root || self.checkpoint.leaf_count != trusted.leaf_count {
            return Err(ChainError::AuditBundle("checkpoint"));
        }
        if self.receipt.record() != self.inclusion.leaf_record {
            return Err(ChainError::AuditBundle("receipt"));
        }
        if self.receipt.leaf != self.inclusion.proof.leaf_index {
            return Err(ChainError::AuditBundle("leaf"));
        }
        mmr::verify(
            &self.inclusion.leaf_record,
            &self.inclusion.proof,
            trusted.leaf_count,
            &trusted.root,
        )
        .map_err(|_| ChainError::Mmr)
    }

    /// Stubs and absent anchors fail closed. A verified [`ExternalAnchoringProof::RekorWitness`]
    /// returns `Ok(())` when the witness matches [`Self::digest`] and the Merkle proof checks out.
    pub fn verify_external_anchoring(&self) -> Result<(), ChainError> {
        match &self.external {
            ExternalAnchoringProof::Absent => Err(ChainError::ExternalAnchorAbsent),
            ExternalAnchoringProof::RekorDryrunStub { .. } => Err(ChainError::ExternalAnchorStub),
            ExternalAnchoringProof::RekorWitness { witness } => {
                verify_recorded_witness(&self.digest(), witness)
            }
            ExternalAnchoringProof::BtcOpReturnPlan {
                op_return,
                broadcast,
            } => {
                if *broadcast {
                    return Err(ChainError::ExternalAnchorStub);
                }
                let bytes: [u8; 37] = op_return
                    .as_slice()
                    .try_into()
                    .map_err(|_| ChainError::InvalidAnchorPrefix)?;
                let state_root = {
                    let mut root = [0u8; 32];
                    root.copy_from_slice(&bytes[5..]);
                    root
                };
                crate::anchor::check_btc_op_return(&bytes, &state_root)?;
                Err(ChainError::ExternalAnchorAbsent)
            }
        }
    }
}