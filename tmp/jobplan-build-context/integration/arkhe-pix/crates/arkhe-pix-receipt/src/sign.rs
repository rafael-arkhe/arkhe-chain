use crate::{error::PixError, receipt::PixReceipt};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Proof {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(rename = "verificationMethod")]
    pub verification_method: String,
    #[serde(rename = "proofValue")]
    pub proof_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignedReceipt {
    pub receipt: PixReceipt,
    pub proof: Proof,
}

impl SignedReceipt {
    /// PoC envelope. Signature is Ed25519 over domain-separated BLAKE3(JCS(PixReceipt)).
    /// This is NOT a W3C Data Integrity suite. It is a transport.
    pub fn sign(receipt: PixReceipt, sk: &SigningKey) -> Result<Self, PixError> {
        receipt.validate()?;
        let digest = receipt.digest()?;
        let sig = sk.sign(&digest);
        Ok(Self {
            receipt,
            proof: Proof {
                kind: "Ed25519SignaturePixPoC".into(),
                verification_method: format!(
                    "ed25519-pubkey-hex:{}",
                    hex::encode(sk.verifying_key().to_bytes())
                ),
                proof_value: URL_SAFE_NO_PAD.encode(sig.to_bytes()),
            },
        })
    }

    pub fn decode_proof_value(&self) -> Result<Signature, PixError> {
        let bytes = URL_SAFE_NO_PAD
            .decode(self.proof.proof_value.as_bytes())
            .map_err(|_| PixError::SignatureInvalid)?;
        if URL_SAFE_NO_PAD.encode(&bytes) != self.proof.proof_value {
            return Err(PixError::SignatureInvalid);
        }
        Signature::from_slice(&bytes).map_err(|_| PixError::SignatureInvalid)
    }
}
