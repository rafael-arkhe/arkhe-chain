#![forbid(unsafe_code)]

pub mod canonical;
pub mod digest;
pub mod envelope;
pub mod error;
pub mod evidence;

pub use canonical::{CanonicalEncode, CanonicalProfile};
pub use digest::{AlgorithmId, Digest};
pub use envelope::{
    ArtifactEnvelope, ArtifactId, AuthenticationProof, CausalParent, CausalProvenance,
    ExternalAnchor, PolicyRef, RelationType,
};
pub use error::{ArkheError, Result};
pub use evidence::{EvidenceRecord, TimeEvidence, WitnessEvidence};
