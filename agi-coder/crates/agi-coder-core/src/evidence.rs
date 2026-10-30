use crate::{ContentHash, WorkerExecutionRecord};
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "record", rename_all = "snake_case")]
pub enum Evidence {
    WorkerExecution(WorkerExecutionRecord),
}
impl Evidence {
    pub fn digest(&self) -> ContentHash {
        match self {
            Self::WorkerExecution(r) => r.record_hash,
        }
    }
}
pub trait EvidenceStore {
    fn get(&self, digest: &ContentHash) -> Option<&Evidence>;
}
