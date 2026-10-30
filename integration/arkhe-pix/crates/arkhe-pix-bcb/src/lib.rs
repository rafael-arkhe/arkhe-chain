//! PENDING: future PSP adapter. No settlement is queried or authenticated.
use thiserror::Error;

pub mod certificates;

#[derive(Debug, Error)]
pub enum BcbError {
    #[error(transparent)]
    Certificate(#[from] certificates::CertificateError),
    #[error("not implemented: {0}")]
    NotImplemented(&'static str),
    #[error("psp credentials missing")]
    NoCredentials,
}

pub struct BcbClient {
    pub base_url: String,
}

impl BcbClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
        }
    }

    /// Purpose selection is checked before the unimplemented signing boundary.
    /// The registry must be trusted configuration. No messages are signed/sent.
    pub fn prepare_message_signing(
        &self,
        registry: &certificates::CertificateRegistry,
        fingerprint: &[u8; 32],
        environment: certificates::Environment,
        now: u64,
    ) -> Result<(), BcbError> {
        registry.authorize(
            fingerprint,
            certificates::Purpose::CertpiaMessage,
            environment,
            now,
        )?;
        Err(BcbError::NotImplemented(
            "production Pix message signing and ICP-Brasil validation are not implemented",
        ))
    }

    pub fn create_cob(&self, _txid: &str, _amount_cents: u64) -> Result<(), BcbError> {
        Err(BcbError::NotImplemented(
            "POST /cob requires PSP mTLS — see ADR-001",
        ))
    }
}
