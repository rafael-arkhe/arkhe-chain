//! DeepInfer offline process integration. Generation is an unverified proposal.
pub mod deepinfer_client;
pub mod sampling;
pub use deepinfer_client::*;
pub use sampling::*;

use agi_coder_core::ContentHash;
use serde::{Deserialize, Serialize};
use std::{future::Future, pin::Pin};

pub const DEEPINFER_REVISION: &str = "9bd9cf243fc53ef9afbf8f04d391d989117d6ab9";
pub const BRIDGE_PROTOCOL: u32 = 1;

#[derive(Debug, thiserror::Error)]
pub enum InferenceError {
    #[error("invalid inference configuration: {0}")]
    Invalid(String),
    #[error("inference bridge I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid inference protocol: {0}")]
    Protocol(String),
    #[error("inference deadline exceeded; the direct child was killed, but GPU descendants may need cleanup")]
    Timeout,
    #[error("inference bridge exited unsuccessfully: {0}")]
    Exit(String),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InferenceRequest {
    /// Exact model/checkpoint identity; the bridge requires a preprovisioned local directory.
    pub model: String,
    pub prompt: String,
    pub sampling: SamplingConfig,
}
impl InferenceRequest {
    pub fn validate(&self) -> Result<(), InferenceError> {
        if self.model.trim().is_empty()
            || self.prompt.trim().is_empty()
            || self.prompt.len() > 1024 * 1024
        {
            return Err(InferenceError::Invalid(
                "model and prompt are required; prompt limit is 1 MiB".into(),
            ));
        }
        self.sampling.validate()
    }
    /// Versioned typed JSON encoding; separate from the integer-only WER CBOR profile.
    pub fn digest(&self) -> Result<ContentHash, InferenceError> {
        self.validate()?;
        Ok(ContentHash::domain(
            "AGI/INFERENCE/REQUEST/v1",
            &[&serde_json::to_vec(self)?],
        ))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BridgeRequest {
    pub protocol: u32,
    pub request_digest: ContentHash,
    pub request: InferenceRequest,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishReason {
    Stop,
    Length,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Generation {
    pub protocol: u32,
    pub request_digest: ContentHash,
    pub model: String,
    pub engine_revision: String,
    pub text: String,
    pub output_tokens: u32,
    pub finish_reason: FinishReason,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceResult {
    pub request_digest: ContentHash,
    pub response_digest: ContentHash,
    pub output_artifact: ContentHash,
    pub generation: Generation,
    pub verified: bool,
}
pub type InferenceFuture<'a> =
    Pin<Box<dyn Future<Output = Result<InferenceResult, InferenceError>> + Send + 'a>>;
pub trait InferenceProvider: Send + Sync {
    fn generate<'a>(&'a self, request: &'a InferenceRequest) -> InferenceFuture<'a>;
}
