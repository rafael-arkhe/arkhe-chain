use crate::{Implementation, Specification};
use agi_coder_core::ContentHash;
use serde::{Deserialize, Serialize};
pub struct Mutant<'a> {
    pub id: String,
    pub implementation: &'a dyn Implementation,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MutationReport {
    pub specification: ContentHash,
    pub baseline_passed: bool,
    pub killed: Vec<String>,
    pub survived: Vec<String>,
    pub total: u32,
    pub score_basis_points: u32,
    pub accepted: bool,
}
pub fn passes(spec: &Specification, program: &dyn Implementation) -> bool {
    !spec.cases.is_empty()
        && spec
            .cases
            .iter()
            .all(|case| program.evaluate(case.input) == Ok(case.expected))
}
