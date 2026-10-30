use thiserror::Error;

#[derive(Debug, Error)]
pub enum PixError {
    #[error("invalid profile or non-synthetic label")]
    InvalidProfile,
    #[error("field bounds or encoding invalid")]
    InvalidBounds,
    #[error("receipt version {0} is not supported")]
    UnsupportedVersion(u32),
    #[error("end_to_end_id does not match BCB format (32 ASCII alphanumeric characters)")]
    InvalidEndToEndId,
    #[error("amount_cents must be > 0")]
    InvalidAmount,
    #[error("currency must be BRL")]
    InvalidCurrency,
    #[error("signature invalid")]
    SignatureInvalid,
    #[error("JCS canonicalization failed: {0}")]
    Jcs(String),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}
