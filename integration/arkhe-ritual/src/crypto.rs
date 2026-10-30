use crate::{require, Result};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
pub type Hash = [u8; 32];
pub fn hash(domain: &[u8], bytes: &[u8]) -> Hash {
    let mut h = blake3::Hasher::new();
    h.update(domain);
    h.update(bytes);
    *h.finalize().as_bytes()
}
/// Wire profile: canonical JSON projections encoded by Arkhe's deterministic CBOR.
/// Arrays remain arrays unless Arkhe's canonical profile declares the key a byte field.
pub fn canonical<T: Serialize>(value: &T) -> Result<Vec<u8>> {
    Ok(arkhe_core::canonical::encode_value(&serde_json::to_value(
        value,
    )?))
}
pub fn digest<T: Serialize>(domain: &[u8], value: &T) -> Result<Hash> {
    Ok(hash(domain, &canonical(value)?))
}

/// Transport has ONE authoritative byte sequence. No caller-supplied decoded twin.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    pub json: Vec<u8>,
    pub signature: Vec<u8>,
}
impl Envelope {
    pub fn sign<T: Serialize>(value: &T, domain: &[u8], key: &SigningKey) -> Result<Self> {
        Ok(Self {
            json: serde_json::to_vec(value)?,
            signature: key.sign(&digest(domain, value)?).to_bytes().to_vec(),
        })
    }
    pub fn open<T: Serialize + DeserializeOwned>(
        &self,
        domain: &[u8],
        key: &VerifyingKey,
    ) -> Result<T> {
        require(self.json.len() <= 1_048_576, "envelope too large")?;
        let value: T = serde_json::from_slice(&self.json)?;
        // Requiring the exact serializer output also rejects duplicate keys, whitespace
        // variants, trailing data and alternative field ordering in this v1 profile.
        require(
            serde_json::to_vec(&value)? == self.json,
            "noncanonical transport",
        )?;
        let sig = Signature::from_slice(&self.signature)
            .map_err(|_| crate::Error::Rejected("signature length"))?;
        key.verify_strict(&digest(domain, &value)?, &sig)
            .map_err(|_| crate::Error::Rejected("signature invalid"))?;
        Ok(value)
    }
}
