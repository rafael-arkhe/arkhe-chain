use serde::{Deserialize, Serialize};
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct CostTracker {
    entries: Vec<CostEntry>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostEntry {
    pub category: String,
    pub micro_usd: u64,
    pub measured: bool,
}
impl CostTracker {
    pub fn record(&mut self, entry: CostEntry) -> Result<(), &'static str> {
        self.total_micro_usd()?
            .checked_add(entry.micro_usd)
            .ok_or("cost overflow")?;
        self.entries.push(entry);
        Ok(())
    }
    pub fn total_micro_usd(&self) -> Result<u64, &'static str> {
        self.entries.iter().try_fold(0u64, |total, e| {
            total.checked_add(e.micro_usd).ok_or("cost overflow")
        })
    }
    pub fn entries(&self) -> &[CostEntry] {
        &self.entries
    }
}
