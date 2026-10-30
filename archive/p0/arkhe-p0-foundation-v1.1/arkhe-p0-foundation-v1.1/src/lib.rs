#![forbid(unsafe_code)]

pub mod canonical;
pub mod digest;
pub mod types;

pub use canonical::{
    canonical_bytes, decode_canonical, CanonicalError, CanonicalValue,
};
pub use digest::{
    digest_canonical, digest_raw, AlgorithmId, Digest, DigestError, HashDomain,
};
pub use types::{
    ArtifactEnvelope, CausalParent, CausalProvenance, EvidenceRecord, RelationType,
    TimeEvidence,
};

pub const ARKHE_CANONICAL_PROFILE_V1: &str = "arkhe.cbor.det.v1";
