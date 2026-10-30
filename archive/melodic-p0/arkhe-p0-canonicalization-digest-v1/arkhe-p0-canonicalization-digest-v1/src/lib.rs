#![forbid(unsafe_code)]

pub mod canonical;
pub mod digest;
pub mod types;

pub use canonical::{canonical_bytes, CanonicalError, CanonicalValue};
pub use digest::{digest_canonical, digest_raw, AlgorithmId, Digest, DigestError};
pub use types::{ArtifactEnvelopeV1, CausalParentV1, EvidenceRecordV1, RelationTypeV1, TimeEvidenceV1};

/// Stable identifier for the first executable Arkhe canonicalization profile.
///
/// This is an executable profile identifier, not a frozen public wire/API version.
pub const ARKHE_CANONICAL_PROFILE_V1: &str = "arkhe.cbor.det.v1";

/// Domain separator for structured/native-Arkhe object hashing.
///
/// Raw external bytes MUST NOT be silently re-encoded or put through this domain.
/// Use `digest_raw` for exact asset/evidence bytes.
pub const ARKHE_STRUCTURED_DIGEST_DOMAIN_V1: &[u8] = b"ARKHE-P0-STRUCTURED-DIGEST-V1\0";
