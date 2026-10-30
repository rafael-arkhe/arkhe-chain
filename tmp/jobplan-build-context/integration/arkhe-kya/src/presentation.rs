//! Untrusted transport container. No verifier policy or trust context inside it.
use crate::{status::StatusEnvelope, Passport};
use serde::{Deserialize, Serialize};
pub const PRESENTATION_FORMAT: &str = "arkhe-kya-presentation@1";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Presentation {
    pub format: String,
    pub label: String,
    pub receipt: Passport,
    pub status: Option<StatusEnvelope>,
}
impl Presentation {
    pub fn parse(json: &str) -> Result<Self, String> {
        if json.len() > 160 * 1024 {
            return Err("PRESENTATION_TOO_LARGE".into());
        }
        let value: Self = serde_json::from_str(json).map_err(|_| "PRESENTATION_INVALID")?;
        if value.format != PRESENTATION_FORMAT || value.label != crate::LABEL {
            return Err("PRESENTATION_PROFILE_INVALID".into());
        }
        Ok(value)
    }
    pub fn parts(&self) -> Result<(String, Option<String>), String> {
        let receipt = serde_json::to_string(&self.receipt).map_err(|_| "PRESENTATION_INVALID")?;
        let status = self
            .status
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|_| "PRESENTATION_INVALID")?;
        Ok((receipt, status))
    }
}
