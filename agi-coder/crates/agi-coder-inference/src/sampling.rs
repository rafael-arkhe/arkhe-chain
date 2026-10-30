use crate::InferenceError;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StructuredOutput {
    pub schema_type: SchemaType,
    /// DeepInfer expects a string (including serialized JSON for a JSON schema).
    pub schema: String,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SchemaType {
    Regex,
    Json,
    Ebnf,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct SamplingConfig {
    pub temperature: f64,
    pub top_p: f64,
    pub top_k: i32,
    pub max_tokens: u32,
    pub seq_seed: Option<u64>,
    pub deterministic: bool,
    pub structured_output: Option<StructuredOutput>,
}
impl Default for SamplingConfig {
    fn default() -> Self {
        Self {
            temperature: 0.0,
            top_p: 1.0,
            top_k: -1,
            max_tokens: 1024,
            seq_seed: Some(0),
            deterministic: false,
            structured_output: None,
        }
    }
}
impl SamplingConfig {
    pub fn validate(&self) -> Result<(), InferenceError> {
        let invalid = |s: &str| InferenceError::Invalid(s.into());
        if !self.temperature.is_finite() || self.temperature < 0.0 {
            return Err(invalid("temperature must be finite and nonnegative"));
        }
        if !self.top_p.is_finite() || self.top_p <= 0.0 || self.top_p > 1.0 {
            return Err(invalid("top_p must be in (0, 1]"));
        }
        if self.top_k != -1 && self.top_k <= 0 {
            return Err(invalid("top_k must be -1 or positive"));
        }
        if self.max_tokens == 0 || self.max_tokens > i32::MAX as u32 {
            return Err(invalid("max_tokens must be in 1..=i32::MAX"));
        }
        if self.deterministic && self.seq_seed.is_none() {
            return Err(invalid("deterministic sampling requires a fixed seq_seed"));
        }
        if let Some(output) = &self.structured_output {
            if output.schema.trim().is_empty() || output.schema.len() > 256 * 1024 {
                return Err(invalid(
                    "structured output schema must be nonempty and at most 256 KiB",
                ));
            }
            if matches!(output.schema_type, SchemaType::Json) {
                let value: serde_json::Value = serde_json::from_str(&output.schema)?;
                if !(value.is_object() || value.is_boolean()) {
                    return Err(invalid("JSON schema must be an object or boolean"));
                }
            }
        }
        Ok(())
    }
}
