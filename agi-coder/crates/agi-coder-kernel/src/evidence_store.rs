use agi_coder_core::{ContentHash, Evidence, EvidenceStore};
use std::collections::BTreeMap;
#[derive(Default)]
pub struct InMemoryEvidenceStore(BTreeMap<ContentHash, Evidence>);
impl InMemoryEvidenceStore {
    pub fn insert(&mut self, evidence: Evidence) -> Result<ContentHash, agi_coder_core::Error> {
        match &evidence {
            Evidence::WorkerExecution(r) => r.verify()?,
        }
        let digest = evidence.digest();
        self.0.insert(digest, evidence);
        Ok(digest)
    }
}
impl EvidenceStore for InMemoryEvidenceStore {
    fn get(&self, h: &ContentHash) -> Option<&Evidence> {
        self.0.get(h)
    }
}
