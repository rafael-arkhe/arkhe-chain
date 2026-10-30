use crate::{ArkheError, Result};
use minicbor::Encoder;

/// Arkhe canonical serialization profile identifier.
///
/// V0 deliberately uses a constrained deterministic-CBOR data model:
/// - fixed-length arrays for protocol structs;
/// - unsigned integer discriminants;
/// - definite lengths only;
/// - no floating-point values;
/// - UTF-8 strings and byte strings exactly as supplied;
/// - no maps in the P0 cryptographic surface.
///
/// Using arrays rather than maps eliminates map-key ordering ambiguity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum CanonicalProfile {
    ArkheCborV0 = 0,
}

impl CanonicalProfile {
    pub const DOMAIN: &'static [u8] = b"ARKHE-P0-CBOR-V0\0";
}

pub trait CanonicalEncode {
    fn encode_canonical(&self, e: &mut Encoder<Vec<u8>>) -> Result<()>;

    fn canonical_bytes(&self) -> Result<Vec<u8>> {
        let mut e = Encoder::new(Vec::new());
        e.bytes(CanonicalProfile::DOMAIN)
            .map_err(|err| ArkheError::CanonicalEncoding(err.to_string()))?;
        e.u8(CanonicalProfile::ArkheCborV0 as u8)
            .map_err(|err| ArkheError::CanonicalEncoding(err.to_string()))?;
        self.encode_canonical(&mut e)?;
        Ok(e.into_writer())
    }
}

pub(crate) fn enc_err<E: core::fmt::Display>(err: E) -> ArkheError {
    ArkheError::CanonicalEncoding(err.to_string())
}
