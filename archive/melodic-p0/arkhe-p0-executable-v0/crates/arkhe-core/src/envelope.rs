use crate::{CanonicalEncode, Digest, Result};
use minicbor::Encoder;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ArtifactId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PolicyRef(pub String);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u16)]
pub enum RelationType {
    DerivedFrom = 1,
    RevisionOf = 2,
    Used = 3,
    GeneratedBy = 4,
    ControlledBy = 5,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CausalParent {
    pub relation: RelationType,
    pub digest: Digest,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CausalProvenance {
    pub parents: Vec<CausalParent>,
}

impl CausalProvenance {
    /// Canonical order is relation discriminant, then digest algorithm, then digest bytes.
    /// This makes parent-set order non-semantic while preserving deterministic bytes.
    pub fn normalized(mut self) -> Self {
        self.parents.sort();
        self.parents.dedup();
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthenticationProof {
    Signature {
        scheme: String,
        key_id: String,
        signature: Vec<u8>,
    },
    Attestation {
        format: String,
        evidence_digest: Digest,
    },
    ChannelBinding {
        binding_type: String,
        binding_digest: Digest,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalAnchor {
    pub kind: String,
    pub reference: String,
    pub evidence_digest: Option<Digest>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactEnvelope {
    pub artifact_id: ArtifactId,
    pub digest: Digest,
    pub provenance: CausalProvenance,
    pub authentication: Option<AuthenticationProof>,
    pub anchor: Option<ExternalAnchor>,
    pub policy_ref: PolicyRef,
}

impl CanonicalEncode for ArtifactEnvelope {
    fn encode_canonical(&self, e: &mut Encoder<Vec<u8>>) -> Result<()> {
        let provenance = self.provenance.clone().normalized();
        e.array(6).map_err(crate::canonical::enc_err)?;
        e.str(&self.artifact_id.0).map_err(crate::canonical::enc_err)?;
        self.digest.encode_canonical(e)?;

        e.array(provenance.parents.len() as u64)
            .map_err(crate::canonical::enc_err)?;
        for parent in provenance.parents {
            e.array(2).map_err(crate::canonical::enc_err)?;
            e.u16(parent.relation as u16)
                .map_err(crate::canonical::enc_err)?;
            parent.digest.encode_canonical(e)?;
        }

        match &self.authentication {
            None => e.null().map_err(crate::canonical::enc_err)?,
            Some(AuthenticationProof::Signature {
                scheme,
                key_id,
                signature,
            }) => {
                e.array(4).map_err(crate::canonical::enc_err)?;
                e.u8(1).map_err(crate::canonical::enc_err)?;
                e.str(scheme).map_err(crate::canonical::enc_err)?;
                e.str(key_id).map_err(crate::canonical::enc_err)?;
                e.bytes(signature).map_err(crate::canonical::enc_err)?;
            }
            Some(AuthenticationProof::Attestation {
                format,
                evidence_digest,
            }) => {
                e.array(3).map_err(crate::canonical::enc_err)?;
                e.u8(2).map_err(crate::canonical::enc_err)?;
                e.str(format).map_err(crate::canonical::enc_err)?;
                evidence_digest.encode_canonical(e)?;
            }
            Some(AuthenticationProof::ChannelBinding {
                binding_type,
                binding_digest,
            }) => {
                e.array(3).map_err(crate::canonical::enc_err)?;
                e.u8(3).map_err(crate::canonical::enc_err)?;
                e.str(binding_type).map_err(crate::canonical::enc_err)?;
                binding_digest.encode_canonical(e)?;
            }
        }

        match &self.anchor {
            None => e.null().map_err(crate::canonical::enc_err)?,
            Some(anchor) => {
                e.array(3).map_err(crate::canonical::enc_err)?;
                e.str(&anchor.kind).map_err(crate::canonical::enc_err)?;
                e.str(&anchor.reference)
                    .map_err(crate::canonical::enc_err)?;
                match &anchor.evidence_digest {
                    Some(digest) => digest.encode_canonical(e)?,
                    None => e.null().map_err(crate::canonical::enc_err)?,
                }
            }
        }

        e.str(&self.policy_ref.0).map_err(crate::canonical::enc_err)?;
        Ok(())
    }
}
