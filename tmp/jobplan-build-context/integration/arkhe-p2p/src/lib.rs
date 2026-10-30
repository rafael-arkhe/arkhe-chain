//! Bounded raw-blob acquisition and offline Bao verification.
//! No uploads, DHT, or E02 profile changes.
pub mod discovery;
pub mod transport;
pub mod verify;

use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid configuration or locator")]
    InvalidInput,
    #[error("byte limit exceeded")]
    TooLarge,
    #[error("SHA-256 mismatch")]
    Sha256Mismatch,
    #[error("BLAKE3 mismatch")]
    Blake3Mismatch,
    #[error("invalid, truncated, or non-framed Bao encoding")]
    BaoInvalid,
    #[error("deadline exceeded")]
    Timeout,
    #[error("HTTP status {0}")]
    HttpStatus(u16),
    #[error("I/O: {0}")]
    Io(#[from] std::io::Error),
    #[error("HTTP: {0}")]
    Http(#[from] reqwest::Error),
}

#[derive(Clone, Copy, Debug)]
pub struct Limits {
    pub max_bytes: usize,
    pub deadline: Duration,
}

impl Limits {
    pub fn validate(self) -> Result<Self, Error> {
        if self.max_bytes == 0 || self.max_bytes > 16 * 1024 * 1024 || self.deadline.is_zero() {
            return Err(Error::InvalidInput);
        }
        Ok(self)
    }
}

/// Only explicitly configured loopback test endpoints may use cleartext.
#[derive(Clone, Copy, Debug, Default)]
pub struct EndpointPolicy {
    pub allow_cleartext_loopback: bool,
}

impl EndpointPolicy {
    pub fn allows(self, url: &url::Url, websocket: bool) -> bool {
        if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
            return false;
        }
        let secure = if websocket { "wss" } else { "https" };
        let clear = if websocket { "ws" } else { "http" };
        url.host_str().is_some()
            && (url.scheme() == secure
                || (self.allow_cleartext_loopback
                    && url.scheme() == clear
                    && url
                        .host_str()
                        .and_then(|s| s.trim_matches(['[', ']']).parse::<std::net::IpAddr>().ok())
                        .is_some_and(|ip| ip.is_loopback())))
    }
}
