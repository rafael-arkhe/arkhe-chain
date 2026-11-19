use crate::{distribution::DistributionObservation, Error};
use arkhe_core::Digest32;
use arkhe_depin::{
    adapters::validate_native_receipt,
    attestation::AttestationVerdict,
    proof::{Checkpoint, CompositeProof, Mmr},
    types::{AttestedReceipt, HardwareAttestation, NativeReceipt},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequireAttestation {
    /// Anchor receipt (and optional distribution) even when NRAS is Unsupported/Denied.
    Optional,
    /// Refuse compose unless attestation is Verified.
    Verified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NetworkBundle {
    pub receipt: NativeReceipt,
    pub distribution: Option<DistributionObservation>,
    pub attestation: AttestationVerdict,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnchoredNetworkBundle {
    pub bundle: NetworkBundle,
    pub proof: CompositeProof,
    pub bundle_digest: Digest32,
}

#[derive(Debug, Clone)]
pub struct NetworkPipeline {
    pub require_attestation: RequireAttestation,
}

impl Default for NetworkPipeline {
    fn default() -> Self {
        Self {
            require_attestation: RequireAttestation::Optional,
        }
    }
}

impl NetworkPipeline {
    /// Compose a network bundle into an MMR-anchored proof.
    ///
    /// Hardware evidence is attached only when `attestation` is `Verified`.
    /// A bare JWT / hardware blob without a Verified verdict is dropped and
    /// never treated as success.
    pub fn compose(
        &self,
        bundle: NetworkBundle,
        hardware: Option<HardwareAttestation>,
        mmr: &mut Mmr,
    ) -> Result<AnchoredNetworkBundle, Error> {
        validate_native_receipt(&bundle.receipt)?;
        if let Some(obs) = &bundle.distribution {
            if !obs.validate_structure() {
                return Err(Error::Policy("invalid distribution observation"));
            }
        }
        match (&self.require_attestation, &bundle.attestation) {
            (RequireAttestation::Verified, AttestationVerdict::Verified { .. }) => {}
            (RequireAttestation::Verified, _) => {
                return Err(Error::Policy("verified NRAS attestation required"));
            }
            (RequireAttestation::Optional, _) => {}
        }

        let hardware_attestation = match (&bundle.attestation, hardware) {
            (AttestationVerdict::Verified { .. }, Some(hw)) => Some(hw),
            (AttestationVerdict::Verified { .. }, None) => {
                return Err(Error::Policy(
                    "verified attestation requires hardware evidence to anchor",
                ));
            }
            (_, _) => None,
        };

        let attested = AttestedReceipt {
            receipt: bundle.receipt.clone(),
            hardware_attestation,
        };
        let proof = CompositeProof::anchor(&attested, mmr)?;
        let bundle_digest = bundle_commitment(&bundle, &proof.mmr_leaf)?;
        Ok(AnchoredNetworkBundle {
            bundle,
            proof,
            bundle_digest,
        })
    }

    pub fn verify(
        &self,
        anchored: &AnchoredNetworkBundle,
        trusted: &Checkpoint,
    ) -> Result<(), Error> {
        validate_native_receipt(&anchored.bundle.receipt)?;
        if let Some(obs) = &anchored.bundle.distribution {
            if !obs.validate_structure() {
                return Err(Error::InvalidBundle);
            }
        }
        match (&self.require_attestation, &anchored.bundle.attestation) {
            (RequireAttestation::Verified, AttestationVerdict::Verified { .. }) => {}
            (RequireAttestation::Verified, _) => {
                return Err(Error::Policy("verified NRAS attestation required"));
            }
            (RequireAttestation::Optional, _) => {}
        }
        if matches!(
            (
                &anchored.bundle.attestation,
                &anchored.proof.attested.hardware_attestation
            ),
            (AttestationVerdict::Verified { .. }, None)
        ) {
            return Err(Error::InvalidBundle);
        }
        if !matches!(
            anchored.bundle.attestation,
            AttestationVerdict::Verified { .. }
        ) && anchored.proof.attested.hardware_attestation.is_some()
        {
            return Err(Error::InvalidBundle);
        }
        if !receipts_equal(&anchored.proof.attested.receipt, &anchored.bundle.receipt) {
            return Err(Error::InvalidBundle);
        }
        anchored.proof.verify(trusted)?;
        let expected = bundle_commitment(&anchored.bundle, &anchored.proof.mmr_leaf)?;
        if expected != anchored.bundle_digest {
            return Err(Error::InvalidBundle);
        }
        Ok(())
    }
}

fn receipts_equal(a: &NativeReceipt, b: &NativeReceipt) -> bool {
    a.provider == b.provider
        && a.kind == b.kind
        && a.receipt_hash == b.receipt_hash
        && a.payload == b.payload
        && a.issued_at == b.issued_at
}

fn bundle_commitment(bundle: &NetworkBundle, mmr_leaf: &Digest32) -> Result<Digest32, Error> {
    #[derive(Serialize)]
    struct Preimage<'a> {
        bundle: &'a NetworkBundle,
        mmr_leaf: &'a Digest32,
    }
    Ok(Digest32::blake3(
        b"ARKHE/NETWORK/BUNDLE/v1",
        &serde_json::to_vec(&Preimage { bundle, mmr_leaf })?,
    ))
}
