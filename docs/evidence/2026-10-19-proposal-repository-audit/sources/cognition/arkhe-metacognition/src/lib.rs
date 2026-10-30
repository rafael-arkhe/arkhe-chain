use arkhe_cognition_sdk::{worker::WorkerExecutionRecord, Digest32};

pub struct SelfAssessment {
    pub confidence_bps: u16,
    pub evidence_coverage_bps: u16,
    pub uncertainty: String,
}

pub fn assess(
    input_digest: Digest32,
    output_digest: Digest32,
    evidence_refs: Vec<Digest32>,
) -> (SelfAssessment, WorkerExecutionRecord) {
    let coverage = if evidence_refs.is_empty() { 0 } else { 10_000 };
    let assessment = SelfAssessment {
        confidence_bps: if coverage > 0 { 7000 } else { 2500 },
        evidence_coverage_bps: coverage,
        uncertainty: if coverage > 0 {
            "residual model uncertainty".into()
        } else {
            "no evidence coverage".into()
        },
    };
    let record = WorkerExecutionRecord {
        classification: None,
        operation: None,
        module_id: "arkhe-metacognition".into(),
        module_version: env!("CARGO_PKG_VERSION").into(),
        input_digest,
        output_digest,
        evidence_refs,
        confidence_bps: Some(assessment.confidence_bps),
        uncertainty_note: Some(assessment.uncertainty.clone()),
        execution_id: format!("meta:{}", output_digest.to_hex()),
    };
    (assessment, record)
}
