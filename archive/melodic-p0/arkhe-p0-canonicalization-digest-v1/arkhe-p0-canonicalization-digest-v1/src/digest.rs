use crate::{canonical_bytes, CanonicalError, CanonicalValue, ARKHE_STRUCTURED_DIGEST_DOMAIN_V1};
use sha2::{Digest as ShaDigest, Sha256};
use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u16)]
pub enum AlgorithmId {
    Sha256 = 1,
    Blake3_256 = 2,
}

impl AlgorithmId {
    pub fn from_u16(value: u16) -> Result<Self, DigestError> {
        match value {
            1 => Ok(Self::Sha256),
            2 => Ok(Self::Blake3_256),
            other => Err(DigestError::UnsupportedAlgorithm(other)),
        }
    }

    pub const fn code(self) -> u16 {
        self as u16
    }

    pub const fn output_len(self) -> usize {
        32
    }
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Digest {
    algorithm: AlgorithmId,
    bytes: [u8; 32],
}

impl Digest {
    pub const fn new(algorithm: AlgorithmId, bytes: [u8; 32]) -> Self {
        Self { algorithm, bytes }
    }

    pub const fn algorithm(&self) -> AlgorithmId {
        self.algorithm
    }

    pub const fn bytes(&self) -> &[u8; 32] {
        &self.bytes
    }

    pub fn to_tagged_bytes(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(34);
        out.extend_from_slice(&self.algorithm.code().to_be_bytes());
        out.extend_from_slice(&self.bytes);
        out
    }

    pub fn from_tagged_bytes(input: &[u8]) -> Result<Self, DigestError> {
        if input.len() != 34 {
            return Err(DigestError::InvalidTaggedLength(input.len()));
        }
        let algorithm = AlgorithmId::from_u16(u16::from_be_bytes([input[0], input[1]]))?;
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(&input[2..]);
        Ok(Self { algorithm, bytes })
    }
}

#[derive(Debug)]
pub enum DigestError {
    UnsupportedAlgorithm(u16),
    InvalidTaggedLength(usize),
    Canonical(CanonicalError),
    ProfileTooLong(usize),
}

impl fmt::Display for DigestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedAlgorithm(v) => write!(f, "unsupported digest algorithm id {v}"),
            Self::InvalidTaggedLength(v) => write!(f, "invalid tagged digest length {v}, expected 34"),
            Self::Canonical(e) => write!(f, "canonicalization failed: {e}"),
            Self::ProfileTooLong(v) => write!(f, "profile identifier too long: {v}"),
        }
    }
}

impl std::error::Error for DigestError {}

impl From<CanonicalError> for DigestError {
    fn from(value: CanonicalError) -> Self {
        Self::Canonical(value)
    }
}

/// Hash exact bytes without Arkhe canonicalization or domain transformation.
///
/// Use for external protocol evidence, source assets, and byte-preservation bindings.
pub fn digest_raw(algorithm: AlgorithmId, bytes: &[u8]) -> Digest {
    Digest::new(algorithm, hash(algorithm, bytes))
}

/// Canonicalize an Arkhe-native semantic value and hash it with explicit domain/profile binding.
///
/// This API MUST NOT be used to reinterpret protocol-defined evidence such as C2PA bytes.
pub fn digest_canonical(
    algorithm: AlgorithmId,
    profile: &str,
    value: &CanonicalValue,
) -> Result<Digest, DigestError> {
    let canonical = canonical_bytes(value)?;
    let profile_bytes = profile.as_bytes();
    let profile_len: u16 = profile_bytes
        .len()
        .try_into()
        .map_err(|_| DigestError::ProfileTooLong(profile_bytes.len()))?;

    let mut input = Vec::with_capacity(
        ARKHE_STRUCTURED_DIGEST_DOMAIN_V1.len() + 2 + profile_bytes.len() + canonical.len(),
    );
    input.extend_from_slice(ARKHE_STRUCTURED_DIGEST_DOMAIN_V1);
    input.extend_from_slice(&profile_len.to_be_bytes());
    input.extend_from_slice(profile_bytes);
    input.extend_from_slice(&canonical);

    Ok(Digest::new(algorithm, hash(algorithm, &input)))
}

fn hash(algorithm: AlgorithmId, bytes: &[u8]) -> [u8; 32] {
    match algorithm {
        AlgorithmId::Sha256 => {
            let out = Sha256::digest(bytes);
            let mut result = [0u8; 32];
            result.copy_from_slice(&out);
            result
        }
        AlgorithmId::Blake3_256 => *blake3::hash(bytes).as_bytes(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ARKHE_CANONICAL_PROFILE_V1;

    #[test]
    fn raw_and_structured_digest_are_distinct() {
        let value = CanonicalValue::Bytes(b"abc".to_vec());
        let canonical = canonical_bytes(&value).unwrap();

        let raw = digest_raw(AlgorithmId::Sha256, &canonical);
        let structured = digest_canonical(
            AlgorithmId::Sha256,
            ARKHE_CANONICAL_PROFILE_V1,
            &value,
        )
        .unwrap();

        assert_ne!(raw.bytes(), structured.bytes());
    }

    #[test]
    fn algorithm_id_is_security_relevant() {
        let value = CanonicalValue::Text("arkhe".into());
        let sha = digest_canonical(
            AlgorithmId::Sha256,
            ARKHE_CANONICAL_PROFILE_V1,
            &value,
        )
        .unwrap();
        let b3 = digest_canonical(
            AlgorithmId::Blake3_256,
            ARKHE_CANONICAL_PROFILE_V1,
            &value,
        )
        .unwrap();
        assert_ne!(sha.to_tagged_bytes(), b3.to_tagged_bytes());
    }

    #[test]
    fn unknown_algorithm_fails_closed() {
        let mut bytes = vec![0u8; 34];
        bytes[0..2].copy_from_slice(&999u16.to_be_bytes());
        assert!(matches!(
            Digest::from_tagged_bytes(&bytes),
            Err(DigestError::UnsupportedAlgorithm(999))
        ));
    }
}
