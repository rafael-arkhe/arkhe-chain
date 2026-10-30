use crate::{passes, Implementation, Mutant, MutationReport, Specification};
#[derive(Debug, thiserror::Error)]
pub enum VerificationError {
    #[error(
        "specification, independent author, unique mutants, and threshold (1..=10000) are required"
    )]
    Invalid,
    #[error(transparent)]
    Core(#[from] agi_coder_core::Error),
}
pub struct SpecificationVerifier {
    pub minimum_score_basis_points: u32,
}
impl SpecificationVerifier {
    pub fn verify(
        &self,
        spec: &Specification,
        implementation_author: &str,
        baseline: &dyn Implementation,
        mutants: &[Mutant<'_>],
    ) -> Result<MutationReport, VerificationError> {
        let ids: std::collections::BTreeSet<_> = mutants.iter().map(|m| &m.id).collect();
        if spec.requirement.trim().is_empty()
            || spec.author.trim().is_empty()
            || implementation_author.trim().is_empty()
            || spec.author == implementation_author
            || spec.cases.is_empty()
            || mutants.is_empty()
            || ids.len() != mutants.len()
            || ids.iter().any(|id| id.trim().is_empty())
            || !(1..=10000).contains(&self.minimum_score_basis_points)
        {
            return Err(VerificationError::Invalid);
        }
        let baseline_passed = passes(spec, baseline);
        let mut killed = Vec::new();
        let mut survived = Vec::new();
        for m in mutants {
            if passes(spec, m.implementation) {
                survived.push(m.id.clone());
            } else {
                killed.push(m.id.clone());
            }
        }
        let score = ((killed.len() as u64 * 10000) / mutants.len() as u64) as u32;
        Ok(MutationReport {
            specification: spec.digest()?,
            baseline_passed,
            total: mutants.len() as u32,
            score_basis_points: score,
            accepted: baseline_passed && score >= self.minimum_score_basis_points,
            killed,
            survived,
        })
    }
}
