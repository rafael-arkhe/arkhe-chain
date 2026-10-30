use agi_coder_core::{SelfCheckResult, TestResults};
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReviewDecision {
    AutoAccept,
    ReviewRequired,
    AutoReject,
}
pub fn route(
    tests: &TestResults,
    violates_invariant: bool,
    documentation_only: bool,
    changed_lines: u32,
) -> ReviewDecision {
    if violates_invariant || tests.result() == SelfCheckResult::Fail {
        ReviewDecision::AutoReject
    } else if tests.result() == SelfCheckResult::Pass && documentation_only && changed_lines <= 20 {
        ReviewDecision::AutoAccept
    } else {
        ReviewDecision::ReviewRequired
    }
}
