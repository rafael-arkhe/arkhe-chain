use agi_coder_core::{ContentHash, Timestamp};
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    pub url: String,
    pub retrieved_at: Timestamp,
    pub content: String,
    pub digest: ContentHash,
}
impl Source {
    pub fn capture(url: String, retrieved_at: Timestamp, content: String) -> Self {
        let digest = ContentHash::hash(content.as_bytes());
        Self {
            url,
            retrieved_at,
            content,
            digest,
        }
    }
    pub fn verify(&self) -> bool {
        ContentHash::hash(self.content.as_bytes()) == self.digest
    }
}
pub trait KnowledgeProvider {
    fn retrieve(&self, query: &str) -> Result<Vec<Source>, String>;
}
