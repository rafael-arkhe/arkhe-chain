//! Local certificate-selection policy over an operator-controlled registration.
//! This does not parse X.509, validate ICP-Brasil chains/CRLs or enroll with BCB.
//! Never construct registrations from a payment request's claimed purpose.
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Purpose {
    CertpicChannel,
    CertpiaMessage,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    Pix,
    Spb,
    Mes,
}

/// Metadata must come from a trusted enrollment/validation service, not the peer.
#[derive(Debug, Clone)]
pub struct Registration {
    pub certificate_sha256: [u8; 32],
    pub public_key_sha256: [u8; 32],
    pub purpose: Purpose,
    pub environment: Environment,
    pub valid_from: u64,
    pub valid_until: u64,
    pub chain_checked: bool,
    pub revocation_good_until: Option<u64>,
    pub revoked: bool,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CertificateError {
    #[error("certificate registration is invalid or ambiguous")]
    InvalidRegistration,
    #[error("certificate or key reused across purposes")]
    ReusedCredential,
    #[error("certificate is not registered")]
    UnknownCertificate,
    #[error("certificate is restricted to the Pix environment")]
    WrongEnvironment,
    #[error("CERTPIC cannot sign messages; CERTPIA cannot authenticate a channel")]
    WrongPurpose,
    #[error("certificate chain or current revocation status is not validated")]
    TrustNotChecked,
    #[error("certificate is expired, not yet valid or revoked")]
    InactiveCertificate,
}

pub struct CertificateRegistry {
    entries: Vec<Registration>,
}

impl CertificateRegistry {
    pub fn new(entries: Vec<Registration>) -> Result<Self, CertificateError> {
        for (index, entry) in entries.iter().enumerate() {
            if entry.certificate_sha256 == [0; 32]
                || entry.public_key_sha256 == [0; 32]
                || entry.valid_from >= entry.valid_until
            {
                return Err(CertificateError::InvalidRegistration);
            }
            for previous in &entries[..index] {
                if previous.certificate_sha256 == entry.certificate_sha256 {
                    return Err(CertificateError::ReusedCredential);
                }
                if previous.public_key_sha256 == entry.public_key_sha256
                    && previous.purpose != entry.purpose
                {
                    return Err(CertificateError::ReusedCredential);
                }
            }
        }
        Ok(Self { entries })
    }

    pub fn authorize(
        &self,
        fingerprint: &[u8; 32],
        requested: Purpose,
        environment: Environment,
        now: u64,
    ) -> Result<(), CertificateError> {
        let entry = self
            .entries
            .iter()
            .find(|entry| &entry.certificate_sha256 == fingerprint)
            .ok_or(CertificateError::UnknownCertificate)?;
        if environment != Environment::Pix || entry.environment != Environment::Pix {
            return Err(CertificateError::WrongEnvironment);
        }
        if entry.purpose != requested {
            return Err(CertificateError::WrongPurpose);
        }
        if entry.revoked || now < entry.valid_from || now >= entry.valid_until {
            return Err(CertificateError::InactiveCertificate);
        }
        if !entry.chain_checked || entry.revocation_good_until.is_none_or(|until| now >= until) {
            return Err(CertificateError::TrustNotChecked);
        }
        Ok(())
    }
}
