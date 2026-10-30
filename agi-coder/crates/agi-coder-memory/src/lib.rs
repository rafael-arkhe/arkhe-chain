//! Inspectable JSON memory with explicit persistence; no implicit vector database.
pub mod episodic;
pub mod semantic;
pub mod working;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub working: working::WorkingMemory,
    pub episodes: Vec<episodic::Episode>,
    pub facts: Vec<semantic::Fact>,
}
impl Memory {
    pub fn save(&self, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
        // create_new protects an existing checkpoint. Use a new path for each revision.
        use std::io::Write;
        let bytes = serde_json::to_vec_pretty(self)?;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        Ok(())
    }
    pub fn load(path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        Ok(serde_json::from_slice(&std::fs::read(path)?)?)
    }
}
