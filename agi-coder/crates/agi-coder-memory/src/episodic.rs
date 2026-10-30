use agi_coder_core::{ContentHash, Timestamp};
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Episode {
    pub session: String,
    pub summary: String,
    pub evidence: Vec<ContentHash>,
    pub at: Timestamp,
}
