//! Portable, versioned evidence contracts. Hashes prove integrity, not truth.
pub mod cbor;
pub mod evidence;
pub mod hash;
pub mod types;
pub mod wer;
pub mod work_intent;
pub use evidence::*;
pub use hash::ContentHash;
pub use types::*;
pub use wer::*;
pub use work_intent::*;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("encoding failed: {0}")]
    Encoding(String),
    #[error("invalid signature or record digest")]
    Signature,
    #[error("invalid value: {0}")]
    Invalid(String),
}
