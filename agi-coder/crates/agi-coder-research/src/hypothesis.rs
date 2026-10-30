use agi_coder_core::ContentHash;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Outcome {
    Pending,
    Supported,
    Refuted,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hypothesis {
    pub statement: String,
    pub outcome: Outcome,
    pub evidence: Vec<ContentHash>,
}
impl Hypothesis {
    pub fn resolve(
        &mut self,
        outcome: Outcome,
        evidence: Vec<ContentHash>,
    ) -> Result<(), &'static str> {
        if self.outcome != Outcome::Pending || outcome == Outcome::Pending || evidence.is_empty() {
            return Err("resolution requires evidence and an unresolved hypothesis");
        }
        self.outcome = outcome;
        self.evidence = evidence;
        Ok(())
    }
}
