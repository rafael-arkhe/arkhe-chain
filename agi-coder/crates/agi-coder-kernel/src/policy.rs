use agi_coder_core::{ContentHash, WorkIntentType};
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    pub allowed_signers: Vec<String>,
    pub allowed_requesters: Vec<String>,
    pub allowed_operations: Vec<WorkIntentType>,
    pub max_age_seconds: i64,
    pub expected_output: ContentHash,
}
