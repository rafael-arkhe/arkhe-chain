use crate::*;
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::Command,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BridgeConfig {
    /// Trusted host configuration, never supplied by a model-generated request.
    pub program: PathBuf,
    pub args: Vec<String>,
    pub timeout_milliseconds: u64,
    pub max_response_bytes: usize,
}
impl BridgeConfig {
    pub fn validate(&self) -> Result<(), InferenceError> {
        if self.program.as_os_str().is_empty()
            || self.timeout_milliseconds == 0
            || !(1024..=16 * 1024 * 1024).contains(&self.max_response_bytes)
        {
            return Err(InferenceError::Invalid(
                "program, positive deadline, and a 1 KiB..16 MiB response limit are required"
                    .into(),
            ));
        }
        Ok(())
    }
}
pub struct DeepInferClient {
    config: BridgeConfig,
}
async fn read_bounded(
    reader: impl AsyncRead + Unpin,
    limit: usize,
) -> Result<Vec<u8>, InferenceError> {
    let mut bytes = Vec::new();
    reader
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .await?;
    if bytes.len() > limit {
        return Err(InferenceError::Protocol(
            "bridge output limit exceeded".into(),
        ));
    }
    Ok(bytes)
}
impl DeepInferClient {
    pub fn new(config: BridgeConfig) -> Result<Self, InferenceError> {
        config.validate()?;
        Ok(Self { config })
    }
    pub async fn generate(
        &self,
        request: &InferenceRequest,
    ) -> Result<InferenceResult, InferenceError> {
        let request_digest = request.digest()?;
        let mut bytes = serde_json::to_vec(&BridgeRequest {
            protocol: BRIDGE_PROTOCOL,
            request_digest,
            request: request.clone(),
        })?;
        bytes.push(b'\n');
        if bytes.len() > 2 * 1024 * 1024 {
            return Err(InferenceError::Invalid(
                "serialized bridge request exceeds 2 MiB".into(),
            ));
        }
        let mut child = Command::new(&self.config.program)
            .args(&self.config.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()?;
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| InferenceError::Protocol("missing stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| InferenceError::Protocol("missing stdout".into()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| InferenceError::Protocol("missing stderr".into()))?;
        let operation = async {
            // Concurrent I/O prevents a chatty child from blocking while the request is sent.
            let send = async {
                stdin.write_all(&bytes).await?;
                stdin.shutdown().await?;
                drop(stdin);
                Ok::<(), InferenceError>(())
            };
            let (_, out, diagnostics, status) = tokio::try_join!(
                send,
                read_bounded(stdout, self.config.max_response_bytes),
                read_bounded(stderr, 256 * 1024),
                async { Ok::<_, InferenceError>(child.wait().await?) }
            )?;
            // Do not include provider diagnostics here: they may echo the prompt or secrets.
            drop(diagnostics);
            if !status.success() {
                return Err(InferenceError::Exit(status.to_string()));
            }
            let generation: Generation = serde_json::from_slice(&out)
                .map_err(|e| InferenceError::Protocol(e.to_string()))?;
            if generation.protocol != BRIDGE_PROTOCOL
                || generation.request_digest != request_digest
                || generation.model != request.model
                || generation.engine_revision != DEEPINFER_REVISION
                || generation.text.trim().is_empty()
                || generation.output_tokens == 0
                || generation.output_tokens > request.sampling.max_tokens
            {
                return Err(InferenceError::Protocol(
                    "response binding, revision, text, or token count mismatch".into(),
                ));
            }
            let response_digest = ContentHash::domain(
                "AGI/INFERENCE/RESPONSE/v1",
                &[&serde_json::to_vec(&generation)?],
            );
            let output_artifact = ContentHash::hash(generation.text.as_bytes());
            Ok(InferenceResult {
                request_digest,
                response_digest,
                output_artifact,
                generation,
                verified: false,
            })
        };
        let result = tokio::time::timeout(
            Duration::from_millis(self.config.timeout_milliseconds),
            operation,
        )
        .await;
        match result {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(error)) => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                Err(error)
            }
            Err(_) => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                Err(InferenceError::Timeout)
            }
        }
    }
}
impl InferenceProvider for DeepInferClient {
    fn generate<'a>(&'a self, request: &'a InferenceRequest) -> InferenceFuture<'a> {
        Box::pin(self.generate(request))
    }
}
