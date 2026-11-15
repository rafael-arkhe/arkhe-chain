//! Attestation MMR rotation at [`super::ATTEST_MAX_RECORDS`] leaves.

use arkhe_core::Digest32;
use arkhe_verify_core::rbb::mmr::Frontier;

use crate::error::ChainError;

use super::AttestRegistry;

pub const MAX_LEAVES: usize = super::ATTEST_MAX_RECORDS;
const ROTATION_DOMAIN: &[u8] = b"AKG:CHAIN:ATTEST:ROTATE:v1\0";
/// Empty-segment root after rotation (`count == 0`).
pub const EMPTY_SEGMENT_ROOT: [u8; 32] = [0u8; 32];

pub const ROTATION_PROOF_LEN: usize = 32 + 8 + 32 + 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RotationOutcome {
    BelowLimit,
    AtLimitRequiresProof,
    Rotated { new_segment_root: [u8; 32] },
}

pub fn rotation_commitment(previous_root: &[u8; 32], previous_count: u64) -> [u8; 32] {
    let mut body = Vec::with_capacity(40);
    body.extend_from_slice(previous_root);
    body.extend_from_slice(&previous_count.to_be_bytes());
    Digest32::blake3(ROTATION_DOMAIN, &body).0
}

/// Build a consistency witness for the current segment (old root bound to count).
pub fn build_rotation_proof(registry: &AttestRegistry) -> Result<Vec<u8>, ChainError> {
    let previous_root = registry.root()?;
    let previous_count = registry.count();
    let commitment = rotation_commitment(&previous_root, previous_count);
    let mut out = Vec::with_capacity(ROTATION_PROOF_LEN);
    out.extend_from_slice(&previous_root);
    out.extend_from_slice(&previous_count.to_be_bytes());
    out.extend_from_slice(&commitment);
    out.extend_from_slice(&EMPTY_SEGMENT_ROOT);
    Ok(out)
}

pub fn verify_rotation_proof_bytes(
    registry: &AttestRegistry,
    proof: &[u8],
) -> Result<[u8; 32], ChainError> {
    if registry.count() < MAX_LEAVES as u64 {
        return Err(ChainError::Attest("full"));
    }
    if proof.len() != ROTATION_PROOF_LEN {
        return Err(ChainError::Attest("full"));
    }
    let previous_root: [u8; 32] = proof[0..32].try_into().map_err(|_| ChainError::Attest("full"))?;
    let previous_count = u64::from_be_bytes(proof[32..40].try_into().map_err(|_| ChainError::Attest("full"))?);
    let commitment: [u8; 32] = proof[40..72].try_into().map_err(|_| ChainError::Attest("full"))?;
    let new_root: [u8; 32] = proof[72..104].try_into().map_err(|_| ChainError::Attest("full"))?;

    if previous_count != registry.count() || previous_root != registry.root()? {
        return Err(ChainError::Attest("full"));
    }
    if commitment != rotation_commitment(&previous_root, previous_count) {
        return Err(ChainError::Attest("full"));
    }
    if new_root != EMPTY_SEGMENT_ROOT {
        return Err(ChainError::Attest("full"));
    }
    Ok(new_root)
}

pub fn check_rotation(
    current_leaves: usize,
    rotation_proof: Option<&[u8]>,
    verify_consistency: impl FnOnce(&[u8]) -> Result<[u8; 32], String>,
) -> Result<RotationOutcome, String> {
    if current_leaves < MAX_LEAVES {
        return Ok(RotationOutcome::BelowLimit);
    }
    match rotation_proof {
        None => Ok(RotationOutcome::AtLimitRequiresProof),
        Some(proof) => {
            let new_root = verify_consistency(proof)?;
            Ok(RotationOutcome::Rotated {
                new_segment_root: new_root,
            })
        }
    }
}

impl AttestRegistry {
    /// Fail-closed unless `proof` matches the full segment and authorizes a new empty MMR.
    pub fn rotate_segment(&mut self, proof: &[u8]) -> Result<(), ChainError> {
        let new_root = verify_rotation_proof_bytes(self, proof)?;
        self.records.clear();
        self.frontier = Frontier::default();
        self.per_signer.clear();
        debug_assert_eq!(new_root, EMPTY_SEGMENT_ROOT);
        Ok(())
    }

    pub(crate) fn ensure_capacity(
        &mut self,
        rotation_proof: Option<&[u8]>,
    ) -> Result<(), ChainError> {
        if self.count() < MAX_LEAVES as u64 {
            return Ok(());
        }
        let proof = rotation_proof.ok_or(ChainError::Attest("full"))?;
        self.rotate_segment(proof)
    }
}