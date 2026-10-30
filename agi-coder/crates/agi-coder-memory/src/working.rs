use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct WorkingMemory {
    pub context: BTreeMap<String, String>,
}
