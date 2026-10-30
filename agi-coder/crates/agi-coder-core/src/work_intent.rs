use crate::{cbor, ContentHash, Did, OperationId, RequestIdentity, Timestamp};
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkIntentType {
    Design,
    Implement,
    Verify,
    Audit,
    Deploy,
    RunJulesSession,
    MergeToProtectedBranch,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkIntent {
    pub requested_by: Did,
    pub intent_type: WorkIntentType,
    pub target: ContentHash,
    pub parameters: serde_json::Value,
    pub request_identity: RequestIdentity,
    pub created_at: Timestamp,
}
impl WorkIntent {
    /// Stable replay slot; parameter/actor differences are detected by the journal.
    pub fn operation_id(&self) -> Result<OperationId, crate::Error> {
        Ok(ContentHash::domain(
            "AGI/OPERATION/v1",
            &[
                &cbor::canonical(&self.intent_type)?,
                self.target.as_bytes(),
                self.request_identity.0.as_bytes(),
            ],
        ))
    }
    pub fn digest(&self) -> Result<ContentHash, crate::Error> {
        // Admission time is deliberately excluded from the immutable request binding.
        Ok(ContentHash::domain(
            "AGI/INTENT/v1",
            &[&cbor::canonical(&(
                &self.requested_by,
                self.intent_type,
                self.target,
                &self.parameters,
                self.request_identity,
            ))?],
        ))
    }
}
