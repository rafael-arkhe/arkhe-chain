//! Run an independent test command against caller-prepared baseline/mutant snapshots.
//! Commands are trusted local input, executed directly without a shell. Isolation is
//! the caller's responsibility; the timeout kills the direct child, not descendants.
use agi_coder_core::ContentHash;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    path::PathBuf,
    process::{Command, Stdio},
    time::{Duration, Instant},
};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCommand {
    pub program: String,
    pub args: Vec<String>,
    pub working_directory: PathBuf,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreparedMutant {
    pub id: String,
    pub test: TestCommand,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessCampaign {
    pub specification_digest: ContentHash,
    pub specification_author: String,
    pub implementation_author: String,
    pub baseline: TestCommand,
    pub mutants: Vec<PreparedMutant>,
    pub timeout_milliseconds: u64,
    pub minimum_score_basis_points: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProcessOutcome {
    Passed,
    Failed,
    TimedOut,
    Error(String),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessReport {
    pub specification_digest: ContentHash,
    pub campaign_digest: ContentHash,
    pub baseline: ProcessOutcome,
    pub outcomes: Vec<(String, ProcessOutcome)>,
    pub score_basis_points: u32,
    pub accepted: bool,
}
fn execute(test: &TestCommand, timeout: Duration) -> ProcessOutcome {
    let mut child = match Command::new(&test.program)
        .args(&test.args)
        .current_dir(&test.working_directory)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return ProcessOutcome::Error(e.to_string()),
    };
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return if status.success() {
                    ProcessOutcome::Passed
                } else {
                    ProcessOutcome::Failed
                }
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return ProcessOutcome::Error(e.to_string());
            }
            Ok(None) => {}
        }
        if start.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return ProcessOutcome::TimedOut;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
}
impl ProcessCampaign {
    pub fn run(&self) -> Result<ProcessReport, crate::VerificationError> {
        let ids: BTreeSet<_> = self.mutants.iter().map(|m| &m.id).collect();
        if self.specification_author.trim().is_empty()
            || self.implementation_author.trim().is_empty()
            || self.specification_author == self.implementation_author
            || self.mutants.is_empty()
            || ids.len() != self.mutants.len()
            || ids.iter().any(|id| id.trim().is_empty())
            || self.timeout_milliseconds == 0
            || !(1..=10000).contains(&self.minimum_score_basis_points)
        {
            return Err(crate::VerificationError::Invalid);
        }
        let campaign_digest = ContentHash::domain(
            "AGI/MUTATION/CAMPAIGN/v1",
            &[&agi_coder_core::cbor::canonical(self)?],
        );
        let timeout = Duration::from_millis(self.timeout_milliseconds);
        let baseline = execute(&self.baseline, timeout);
        // A broken baseline cannot yield a meaningful mutation score.
        let outcomes: Vec<_> = if baseline == ProcessOutcome::Passed {
            self.mutants
                .iter()
                .map(|m| (m.id.clone(), execute(&m.test, timeout)))
                .collect()
        } else {
            vec![]
        };
        let killed = outcomes
            .iter()
            .filter(|(_, o)| *o == ProcessOutcome::Failed)
            .count();
        let score = ((killed as u64 * 10000) / self.mutants.len() as u64) as u32;
        let valid = outcomes
            .iter()
            .all(|(_, o)| matches!(o, ProcessOutcome::Passed | ProcessOutcome::Failed));
        Ok(ProcessReport {
            specification_digest: self.specification_digest,
            campaign_digest,
            accepted: baseline == ProcessOutcome::Passed
                && valid
                && score >= self.minimum_score_basis_points,
            baseline,
            outcomes,
            score_basis_points: score,
        })
    }
}
