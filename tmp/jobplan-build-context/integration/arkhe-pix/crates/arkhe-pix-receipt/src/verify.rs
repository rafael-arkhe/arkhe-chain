use crate::{error::PixError, sign::SignedReceipt};
use ed25519_dalek::VerifyingKey;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case", tag = "verdict")]
// Bounded result constructed once per receipt; keep the public tagged JSON shape simple.
#[allow(clippy::large_enum_variant)]
pub enum ReceiptOutcome {
    SignatureValidSynthetic {
        profile: String,
        label: String,
        settlement: String,
        kya_authorization: String,
        purpose_binding: String,
        receipt_digest: String,
        e2e: String,
        amount_cents: u64,
        purpose_hash: Option<String>,
        passport_digest: Option<String>,
    },
    NotVerifiable {
        reason: PixErrorReason,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PixErrorReason {
    SignatureInvalid,
    ReceiptInvalid,
    VersionUnsupported,
    E2eInvalid,
    AmountInvalid,
    CurrencyInvalid,
}

/// Verify a signed receipt against a pinned signer key.
/// The BCB `end_to_end_id` is NOT verified here — that requires
/// the BCB record, which the PoC does not have.
pub fn verify_receipt(signed: &SignedReceipt, pinned_signer: &VerifyingKey) -> ReceiptOutcome {
    if signed.proof.kind != "Ed25519SignaturePixPoC"
        || signed.proof.verification_method
            != format!(
                "ed25519-pubkey-hex:{}",
                hex::encode(pinned_signer.to_bytes())
            )
    {
        return ReceiptOutcome::NotVerifiable {
            reason: PixErrorReason::SignatureInvalid,
        };
    }
    if let Err(e) = signed.receipt.validate() {
        return ReceiptOutcome::NotVerifiable { reason: e.into() };
    }
    let digest = match signed.receipt.digest() {
        Ok(d) => d,
        Err(_) => {
            return ReceiptOutcome::NotVerifiable {
                reason: PixErrorReason::ReceiptInvalid,
            };
        }
    };
    let sig = match signed.decode_proof_value() {
        Ok(s) => s,
        Err(_) => {
            return ReceiptOutcome::NotVerifiable {
                reason: PixErrorReason::SignatureInvalid,
            }
        }
    };
    if pinned_signer.verify_strict(&digest, &sig).is_err() {
        return ReceiptOutcome::NotVerifiable {
            reason: PixErrorReason::SignatureInvalid,
        };
    }
    ReceiptOutcome::SignatureValidSynthetic {
        profile: "arkhe-pix-receipt@1".into(),
        label: "synthetic-poc".into(),
        settlement: "NOT_VERIFIED".into(),
        kya_authorization: "NOT_VERIFIED".into(),
        purpose_binding: "SIGNER_CLAIM_ONLY".into(),
        receipt_digest: hex::encode(digest),
        e2e: signed.receipt.end_to_end_id.clone(),
        amount_cents: signed.receipt.amount_cents,
        purpose_hash: signed.receipt.purpose_hash.clone(),
        passport_digest: signed.receipt.passport_digest.clone(),
    }
}

impl From<PixError> for PixErrorReason {
    fn from(e: PixError) -> Self {
        match e {
            PixError::UnsupportedVersion(_) => PixErrorReason::VersionUnsupported,
            PixError::InvalidEndToEndId => PixErrorReason::E2eInvalid,
            PixError::InvalidAmount => PixErrorReason::AmountInvalid,
            PixError::InvalidCurrency => PixErrorReason::CurrencyInvalid,
            PixError::SignatureInvalid => PixErrorReason::SignatureInvalid,
            PixError::InvalidProfile
            | PixError::InvalidBounds
            | PixError::Jcs(_)
            | PixError::Json(_) => PixErrorReason::ReceiptInvalid,
        }
    }
}
