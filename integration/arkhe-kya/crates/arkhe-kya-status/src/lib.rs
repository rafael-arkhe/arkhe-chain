//! Local signed status profile; bit encoding follows W3C BSL v1.0.
//! This envelope is not a W3C Verifiable Credential or Data Integrity proof.
pub use arkhe_kya_primitives::LABEL;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read};

pub const STATUS_PROFILE: &str = "arkhe-kya-status-local@1";
const MAX_RAW: usize = 1024 * 1024;
const MAX_COMPRESSED: usize = 64 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StatusPurpose {
    Revocation,
    Suspension,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PassportStatus {
    pub profile: String,
    pub label: String,
    pub issuer: String,
    pub passport_digest: String,
    pub status_list_credential: String,
    pub status_list_index: u32,
    pub status_purpose: StatusPurpose,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StatusList {
    pub profile: String,
    pub label: String,
    pub id: String,
    pub issuer: String,
    pub status_purpose: StatusPurpose,
    pub sequence: u32,
    pub valid_from: u64,
    pub valid_until: u64,
    pub encoded_list: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignedStatusList {
    pub list: StatusList,
    pub signature: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StatusEnvelope {
    pub binding: PassportStatus,
    pub binding_signature: String,
    pub status_list: Option<SignedStatusList>,
}

/// External policy and subject commitment. No Passport, mandate or model type.
#[derive(Clone, Debug)]
pub struct StatusTrust {
    pub trusted_issuer: String,
    pub expected_passport_digest: String,
    pub required_purpose: StatusPurpose,
    pub now: u64,
    pub minimum_sequence: u32,
    pub max_snapshot_age_seconds: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct StatusObservation {
    pub status_purpose: StatusPurpose,
    pub sequence: u32,
    pub status_list_credential: String,
    pub snapshot_valid_from: u64,
    pub snapshot_valid_until: u64,
    pub evaluated_at: u64,
}

pub fn binding_payload(binding: &PassportStatus) -> Result<Vec<u8>, String> {
    arkhe_kya_primitives::payload(b"ARKHE:KYA:STATUS-BINDING:v1\0", binding)
}
pub fn list_payload(list: &StatusList) -> Result<Vec<u8>, String> {
    arkhe_kya_primitives::payload(b"ARKHE:KYA:STATUS-LIST:v1\0", list)
}

fn bit(encoded: &str, index: u32) -> Result<bool, String> {
    if encoded.len() > (MAX_COMPRESSED * 4).div_ceil(3) + 1 {
        return Err("STATUS_ENCODING_TOO_LARGE".into());
    }
    let encoded = encoded.strip_prefix('u').ok_or("STATUS_ENCODING_INVALID")?;
    let compressed = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| "STATUS_ENCODING_INVALID")?;
    if compressed.len() > MAX_COMPRESSED || URL_SAFE_NO_PAD.encode(&compressed) != encoded {
        return Err("STATUS_ENCODING_INVALID".into());
    }
    let mut decoder = flate2::bufread::GzDecoder::new(Cursor::new(compressed.as_slice()));
    let mut plain = Vec::new();
    (&mut decoder)
        .take((MAX_RAW + 1) as u64)
        .read_to_end(&mut plain)
        .map_err(|_| "STATUS_GZIP_INVALID")?;
    if plain.len() > MAX_RAW {
        return Err("STATUS_DECOMPRESSION_LIMIT".into());
    }
    if plain.len() < 16 * 1024 || decoder.into_inner().position() != compressed.len() as u64 {
        return Err("STATUS_BITSTRING_INVALID".into());
    }
    let byte = *plain
        .get(index as usize / 8)
        .ok_or("STATUS_INDEX_OUT_OF_RANGE")?;
    // BSL v1.0 index zero is the left-most (most significant) bit.
    Ok(byte & (0x80 >> (index % 8)) != 0)
}

pub fn check_status(e: &StatusEnvelope, trust: &StatusTrust) -> Result<StatusObservation, String> {
    if trust.now > 9_007_199_254_740_991
        || trust.max_snapshot_age_seconds == 0
        || trust.max_snapshot_age_seconds > 3600
    {
        return Err("STATUS_POLICY_INVALID".into());
    }
    arkhe_kya_primitives::hex_bytes::<32>(&trust.expected_passport_digest)?;
    let b = &e.binding;
    if b.status_purpose != trust.required_purpose {
        return Err("STATUS_PURPOSE_POLICY_MISMATCH".into());
    }
    if b.profile != STATUS_PROFILE
        || b.label != LABEL
        || b.issuer != trust.trusted_issuer
        || b.passport_digest != trust.expected_passport_digest
        || !arkhe_kya_primitives::text(&b.status_list_credential, 1, 512)
    {
        return Err("STATUS_BINDING_INVALID".into());
    }
    arkhe_kya_primitives::signature(&b.issuer, &e.binding_signature, &binding_payload(b)?)?;
    let signed = e.status_list.as_ref().ok_or("STATUS_UNAVAILABLE")?;
    let list = &signed.list;
    if list.encoded_list.len() > (MAX_COMPRESSED * 4).div_ceil(3) + 1 {
        return Err("STATUS_ENCODING_TOO_LARGE".into());
    }
    if list.profile != STATUS_PROFILE
        || list.label != LABEL
        || list.issuer != b.issuer
        || list.id != b.status_list_credential
        || list.status_purpose != b.status_purpose
        || list.sequence < trust.minimum_sequence
    {
        return Err("STATUS_LIST_MISMATCH_OR_ROLLBACK".into());
    }
    if list.valid_from > trust.now
        || trust.now >= list.valid_until
        || list.valid_until <= list.valid_from
        || list.valid_until > 9_007_199_254_740_991
        || list.valid_until - list.valid_from > 3600
    {
        return Err("STATUS_TIME_INVALID".into());
    }
    // Authenticate metadata and compressed bytes BEFORE decompression.
    arkhe_kya_primitives::signature(&list.issuer, &signed.signature, &list_payload(list)?)?;
    if trust.now - list.valid_from > u64::from(trust.max_snapshot_age_seconds) {
        return Err("STATUS_STALE".into());
    }
    if bit(&list.encoded_list, b.status_list_index)? {
        return Err(match b.status_purpose {
            StatusPurpose::Revocation => "CredentialRevoked",
            StatusPurpose::Suspension => "CredentialSuspended",
        }
        .into());
    }
    Ok(StatusObservation {
        status_purpose: b.status_purpose,
        sequence: list.sequence,
        status_list_credential: list.id.clone(),
        snapshot_valid_from: list.valid_from,
        snapshot_valid_until: list.valid_until,
        evaluated_at: trust.now,
    })
}
