use agi_coder_core::ContentHash;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fact {
    pub text: String,
    pub source: ContentHash,
}
pub fn search<'a>(facts: &'a [Fact], query: &str) -> Vec<&'a Fact> {
    let query = query.to_lowercase();
    facts
        .iter()
        .filter(|f| f.text.to_lowercase().contains(&query))
        .collect()
}
