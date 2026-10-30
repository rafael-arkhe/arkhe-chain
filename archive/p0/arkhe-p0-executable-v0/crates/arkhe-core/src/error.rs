use thiserror::Error;

pub type Result<T> = std::result::Result<T, ArkheError>;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ArkheError {
    #[error("unsupported canonical profile")]
    UnsupportedCanonicalProfile,
    #[error("unsupported digest algorithm")]
    UnsupportedDigestAlgorithm,
    #[error("invalid digest length for algorithm {algorithm}: expected {expected}, got {actual}")]
    InvalidDigestLength {
        algorithm: &'static str,
        expected: usize,
        actual: usize,
    },
    #[error("canonical CBOR encoding failed: {0}")]
    CanonicalEncoding(String),
    #[error("semantic validation failed: {0}")]
    Semantic(&'static str),
}
