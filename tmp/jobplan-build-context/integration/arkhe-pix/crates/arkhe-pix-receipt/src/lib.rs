pub mod error;
pub mod receipt;
pub mod sign;
pub mod verify;

pub use error::PixError;
pub use receipt::{PartyRef, PixReceipt, TaxIdKind};
pub use sign::{Proof, SignedReceipt};
pub use verify::{verify_receipt, PixErrorReason, ReceiptOutcome};

/// Bounded JSON entry point shared by CLI and WASM. Trust key comes from the caller.
pub fn verify_receipt_json(input: &str, signer_hex: &str) -> String {
    let error =
        || serde_json::json!({"verdict":"not_verifiable","reason":"input_invalid"}).to_string();
    if input.len() > 32768
        || signer_hex.len() != 64
        || !signer_hex
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return error();
    }
    let signed: SignedReceipt = match serde_json::from_str(input) {
        Ok(v) => v,
        Err(_) => return error(),
    };
    let key = match hex::decode(signer_hex)
        .ok()
        .and_then(|b| <[u8; 32]>::try_from(b).ok())
        .and_then(|b| ed25519_dalek::VerifyingKey::from_bytes(&b).ok())
    {
        Some(k) => k,
        None => return error(),
    };
    serde_json::to_string(&verify_receipt(&signed, &key)).unwrap_or_else(|_| error())
}
