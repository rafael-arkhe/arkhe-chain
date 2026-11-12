//! Composition fabric for DePIN receipts, NRAS attestation verdicts, and P2P
//! distribution observations. This is not a peer network and does not authenticate
//! upstream DePIN providers or live NVIDIA NRAS.

pub mod distribution;
pub mod pipeline;

pub use distribution::DistributionObservation;
pub use pipeline::{AnchoredNetworkBundle, NetworkBundle, NetworkPipeline, RequireAttestation};

use arkhe_depin::Error as DepinError;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Depin(#[from] DepinError),
    #[error("network policy: {0}")]
    Policy(&'static str),
    #[error("bundle integrity failure")]
    InvalidBundle,
    #[error(transparent)]
    Serialization(#[from] serde_json::Error),
}
