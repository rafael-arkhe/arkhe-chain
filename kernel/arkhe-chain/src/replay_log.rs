use serde::{Deserialize, Serialize};

use crate::ChainError;

/// One re-execution observation. `elapsed_ns` is the duration of that call.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReplayRecord {
    pub height: u64,
    pub tx_count: u64,
    pub elapsed_ns: u64,
    pub adopted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn format_replay(record: &ReplayRecord) -> Result<String, ChainError> {
    if record.adopted == record.error.is_some() {
        return Err(ChainError::Malformed);
    }
    serde_json::to_string(record).map_err(|_| ChainError::Malformed)
}

pub fn parse_replay(line: &str) -> Result<ReplayRecord, ChainError> {
    let record: ReplayRecord =
        serde_json::from_str(line.trim()).map_err(|_| ChainError::Malformed)?;
    if record.adopted == record.error.is_some() {
        return Err(ChainError::Malformed);
    }
    Ok(record)
}
