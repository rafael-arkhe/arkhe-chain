use arkhe_cognition_sdk::{worker::WorkerExecutionRecord, Digest32};

pub mod citation;
pub mod decoder;
pub mod ncm_harness;
pub mod retrieval;
pub mod vq_tokenv;

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

fn response_pair(
    query: &[u8],
    answer: &[u8],
    citations: Vec<Citation>,
    grounded: bool,
    note: Option<&str>,
) -> (RagResponse, WorkerExecutionRecord) {
    let input_digest = Digest32::blake3(b"AKG:RAG:QUERY:v0\0", query);
    let answer_digest = Digest32::blake3(b"AKG:RAG:ANSWER:v0\0", answer);
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
        uncertainty_note: note.map(str::to_string),
        execution_id: format!("rag:{}", answer_digest.to_hex()),
    };
    (response, record)
}

/// Records a citation list. A non-empty list is not grounding: call
/// `bind_citations` with chunks that already passed `authorized_retrieval`.
pub fn build_response(
    query: &[u8],
    answer: &[u8],
    citations: Vec<Citation>,
) -> (RagResponse, WorkerExecutionRecord) {
    let note = if citations.is_empty() {
        "response has no citations"
    } else {
        "citation list is not a grounding proof"
    };
    response_pair(query, answer, citations, false, Some(note))
}

/// Grounding holds only when every citation names an authorized chunk whose
/// content digest and source match. This does not prove the chunk is true.
pub fn bind_citations(
    query: &[u8],
    answer: &[u8],
    citations: Vec<Citation>,
    authorized: &[&RetrievalChunk],
) -> Result<(RagResponse, WorkerExecutionRecord), &'static str> {
    for chunk in authorized {
        if chunk.content.len() > 32768
            || Digest32::blake3(b"AKG:RAG:CHUNK:v1\0", &chunk.content) != chunk.expected_digest
        {
            return Err("invalid retrieved chunk");
        }
    }
    let bound = !citations.is_empty()
        && citations.iter().all(|citation| {
            authorized.iter().any(|chunk| {
                chunk.source_ref == citation.source_ref
                    && chunk.expected_digest == citation.chunk_digest
            })
        });
    let note = if citations.is_empty() {
        Some("response has no citations")
    } else if !bound {
        Some("citation is not bound to an authorized chunk")
    } else {
        None
    };
    Ok(response_pair(query, answer, citations, bound, note))
}

/// Builds chunks only from hits that exist in the immutable snapshot, then
/// applies tenant authorization and citation binding. A document that is in
/// the index but absent from `hits` cannot ground the answer.
pub fn ground_retrieved(
    query: &[u8],
    answer: &[u8],
    citations: Vec<Citation>,
    index: &retrieval::Bm25Index,
    hits: &[retrieval::Hit],
    tenant: &str,
    subject: &str,
) -> Result<(RagResponse, WorkerExecutionRecord), &'static str> {
    let mut seen = std::collections::BTreeSet::new();
    let mut chunks = Vec::with_capacity(hits.len());
    for hit in hits {
        if hit.id.is_empty() || hit.id != hit.id.trim() {
            return Err("hit is outside snapshot");
        }
        if !seen.insert(hit.id.clone()) {
            return Err("duplicate retrieval hit");
        }
        let document = index.document(&hit.id).ok_or("hit is outside snapshot")?;
        if document.id != hit.id {
            return Err("hit is outside snapshot");
        }
        chunks.push(RetrievalChunk {
            tenant: tenant.to_string(),
            readers: vec![subject.to_string()],
            content: document.text.as_bytes().to_vec(),
            expected_digest: Digest32::blake3(b"AKG:RAG:CHUNK:v1\0", document.text.as_bytes()),
            source_ref: Digest32::blake3(b"AKG:RAG:SOURCE:v1\0", document.id.as_bytes()),
        });
    }
    let authorized = authorized_retrieval(tenant, subject, &chunks)?;
    bind_citations(query, answer, citations, &authorized)
}

/// Grounds a retrieved hit only when that hit's text is included under the
/// supplied `arkhe-mmr` root. The root is not a checkpoint and is not authenticated.
pub fn ground_included(
    query: &[u8],
    answer: &[u8],
    citations: Vec<Citation>,
    index: &retrieval::Bm25Index,
    hits: &[retrieval::Hit],
    tenant: &str,
    subject: &str,
    leaf_index: usize,
    proof: &[arkhe_verify_core::mmr::ProofStep],
    root: &[u8; 32],
) -> Result<(RagResponse, WorkerExecutionRecord), &'static str> {
    let (response, record) =
        ground_retrieved(query, answer, citations, index, hits, tenant, subject)?;
    if !response.grounded {
        return Ok((response, record));
    }
    if root == &[0u8; 32] {
        return Err("unauthenticated MMR root");
    }
    let leaf = hits
        .get(leaf_index)
        .and_then(|hit| index.document(&hit.id))
        .ok_or("invalid MMR leaf position")?;
    let leaf_bytes = leaf.text.as_bytes();
    let included =
        arkhe_verify_core::mmr::verify_proof_at(leaf_bytes, hits.len(), leaf_index, proof, root)
            .map_err(|_| "invalid MMR proof")?;
    let cited = response.citations.iter().all(|citation| {
        citation.chunk_digest == Digest32::blake3(b"AKG:RAG:CHUNK:v1\0", leaf_bytes)
            && citation.source_ref == Digest32::blake3(b"AKG:RAG:SOURCE:v1\0", leaf.id.as_bytes())
    });
    if included && cited {
        return Ok((response, record));
    }
    Ok(response_pair(
        query,
        answer,
        response.citations,
        false,
        Some("citation is not included under the supplied MMR root"),
    ))
}
/// A candidate must be authorized before its bytes are used to assemble a prompt.
/// This does not classify malicious natural language; retrieved content remains untrusted.
pub struct RetrievalChunk {
    pub tenant: String,
    pub readers: Vec<String>,
    pub content: Vec<u8>,
    pub expected_digest: Digest32,
    pub source_ref: Digest32,
}
pub fn authorized_retrieval<'a>(
    tenant: &str,
    subject: &str,
    chunks: &'a [RetrievalChunk],
) -> Result<Vec<&'a RetrievalChunk>, &'static str> {
    if tenant.trim().is_empty() || subject.trim().is_empty() {
        return Err("identity required");
    }
    let mut result = Vec::new();
    for chunk in chunks {
        if chunk.tenant != tenant || !chunk.readers.iter().any(|s| s == subject) {
            continue;
        }
        if chunk.content.len() > 32768
            || Digest32::blake3(b"AKG:RAG:CHUNK:v1\0", &chunk.content) != chunk.expected_digest
        {
            return Err("invalid retrieved chunk");
        }
        result.push(chunk);
    }
    if result.len() > 32 {
        return Err("retrieval budget exceeded");
    }
    Ok(result)
}
