use arkhe_cognition_sdk::{worker::WorkerExecutionRecord, Digest32};

#[derive(Debug, Clone)]
pub struct Citation {
    pub source_ref: Digest32,
    pub chunk_digest: Digest32,
}

#[derive(Debug, Clone)]
pub struct RagResponse {
    pub answer_digest: Digest32,
    pub citations: Vec<Citation>,
    pub grounded: bool,
}

pub fn build_response(
    query: &[u8],
    answer: &[u8],
    citations: Vec<Citation>,
) -> (RagResponse, WorkerExecutionRecord) {
    let input_digest = Digest32::blake3(b"AKG:RAG:QUERY:v0\0", query);
    let answer_digest = Digest32::blake3(b"AKG:RAG:ANSWER:v0\0", answer);
    let grounded = !citations.is_empty();
    let refs = citations.iter().map(|c| c.source_ref).collect();
    let response = RagResponse {
        answer_digest,
        citations,
        grounded,
    };
    let record = WorkerExecutionRecord {
        classification: None,
        operation: None,
        module_id: "arkhe-rag".into(),
        module_version: env!("CARGO_PKG_VERSION").into(),
        input_digest,
        output_digest: answer_digest,
        evidence_refs: refs,
        confidence_bps: None,
        uncertainty_note: if grounded {
            None
        } else {
            Some("response has no citations".into())
        },
        execution_id: format!("rag:{}", answer_digest.to_hex()),
    };
    (response, record)
}
