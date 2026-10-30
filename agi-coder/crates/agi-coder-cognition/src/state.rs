use crate::Plan;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkingState {
    pub plan: Plan,
    pub observations: Vec<String>,
    pub steps: u32,
}
