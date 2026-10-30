use crate::{ArkheError, CanonicalEncode, Result};
use minicbor::Encoder;
use sha2::{Digest as _, Sha256};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u16)]
pub enum AlgorithmId {
    Sha256 = 1,
    Blake3 = 2,
}

impl AlgorithmId {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Sha256 => "sha-256",
            Self::Blake3 => "blake3-256",
        }
    }

    pub const fn output_len(self) -> usize {
        32
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Digest {
    algorithm: AlgorithmId,
    bytes: Vec<u8>,
}

impl Digest {
    pub fn new(algorithm: AlgorithmId, bytes: Vec<u8>) -> Result<Self> {
        let expected = algorithm.output_len();
        if bytes.len() != expected {
            return Err(ArkheError::InvalidDigestLength {
                algorithm: algorithm.name(),
                expected,
                actual: bytes.len(),
            });
        }
        Ok(Self { algorithm, bytes })
    }

    pub fn compute(algorithm: AlgorithmId, data: &[u8]) -> Self {
        let bytes = match algorithm {
            AlgorithmId::Sha256 => Sha256::digest(data).to_vec(),
            AlgorithmId::Blake3 => blake3::hash(data).as_bytes().to_vec(),
        };
        Self { algorithm, bytes }
    }

    pub fn verify(&self, data: &[u8]) -> bool {
        Self::compute(self.algorithm, data) == *self
    }

    pub fn algorithm(&self) -> AlgorithmId {
        self.algorithm
    }

    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes
    }

    pub fn to_hex(&self) -> String {
        hex::encode(&self.bytes)
    }
}

impl CanonicalEncode for Digest {
    fn encode_canonical(&self, e: &mut Encoder<Vec<u8>>) -> Result<()> {
        e.array(2).map_err(crate::canonical::enc_err)?;
        e.u16(self.algorithm as u16)
            .map_err(crate::canonical::enc_err)?;
        e.bytes(&self.bytes).map_err(crate::canonical::enc_err)?;
        Ok(())
    }
}
