//! Shared canonicalization and strict Ed25519 helpers. No credentials or network.
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Serialize;
pub const LABEL: &str = "synthetic-poc";

pub fn did_key(public: &[u8; 32]) -> String {
    let mut encoded = vec![0xed, 0x01];
    encoded.extend_from_slice(public);
    format!("did:key:z{}", bs58::encode(encoded).into_string())
}

fn key(did: &str) -> Result<VerifyingKey, String> {
    if did.len() > 64 {
        return Err("INVALID_DID".into());
    }
    let encoded = did.strip_prefix("did:key:z").ok_or("INVALID_DID")?;
    let bytes = bs58::decode(encoded)
        .into_vec()
        .map_err(|_| "INVALID_DID")?;
    if bytes.len() != 34 || bytes[..2] != [0xed, 0x01] {
        return Err("INVALID_DID".into());
    }
    let public: [u8; 32] = bytes[2..].try_into().map_err(|_| "INVALID_DID")?;
    if did_key(&public) != did {
        return Err("INVALID_DID".into());
    }
    let key = VerifyingKey::from_bytes(&public).map_err(|_| "INVALID_DID")?;
    if key.is_weak() {
        return Err("WEAK_KEY".into());
    }
    Ok(key)
}

pub fn hex_bytes<const N: usize>(value: &str) -> Result<[u8; N], String> {
    if value.len() != N * 2
        || !value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("NON_CANONICAL_HEX".into());
    }
    hex::decode(value)
        .map_err(|_| "INVALID_HEX".to_string())?
        .try_into()
        .map_err(|_| "INVALID_HEX".into())
}

pub fn canonical<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    serde_jcs::to_vec(value).map_err(|_| "CANONICALIZATION_FAILED".into())
}

pub fn payload<T: Serialize>(domain: &[u8], value: &T) -> Result<Vec<u8>, String> {
    let mut bytes = domain.to_vec();
    bytes.extend(canonical(value)?);
    Ok(bytes)
}

pub fn signature(did: &str, sig: &str, bytes: &[u8]) -> Result<(), String> {
    key(did)?
        .verify_strict(bytes, &Signature::from_bytes(&hex_bytes::<64>(sig)?))
        .map_err(|_| "SIGNATURE_INVALID".into())
}
pub fn text(value: &str, min: usize, max: usize) -> bool {
    value.len() >= min && value.len() <= max && !value.chars().any(char::is_control)
}
