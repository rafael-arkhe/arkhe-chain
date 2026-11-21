use arkhe_cognition_sdk::Digest32;
use arkhe_rag::retrieval::{Bm25Index, Document, Hit, HybridRetriever};
use arkhe_rag::{
    authorized_retrieval, bind_citations, build_response, ground_included, ground_retrieved,
    Citation, RetrievalChunk,
};
use arkhe_verify_core::mmr::build_root_and_proof;

fn chunk(tenant: &str, reader: &str, content: &str, source: &str) -> RetrievalChunk {
    RetrievalChunk {
        tenant: tenant.into(),
        readers: vec![reader.into()],
        content: content.as_bytes().to_vec(),
        expected_digest: Digest32::blake3(b"AKG:RAG:CHUNK:v1\0", content.as_bytes()),
        source_ref: Digest32::blake3(b"AKG:RAG:SOURCE:v1\0", source.as_bytes()),
    }
}

fn cite(chunk: &RetrievalChunk) -> Citation {
    Citation {
        source_ref: chunk.source_ref,
        chunk_digest: chunk.expected_digest,
    }
}

#[test]
fn citation_presence_is_not_grounding() {
    let stored = chunk("local", "alice", "Sydney opened in 1956", "corpus");
    let (present, _) = build_response(b"when", b"Sydney opened in 1956", vec![cite(&stored)]);
    assert!(!present.grounded);
    let (empty, record) = build_response(b"when", b"undated", vec![]);
    assert!(!empty.grounded);
    assert_eq!(
        record.uncertainty_note.as_deref(),
        Some("response has no citations")
    );
}

#[test]
fn authorized_chunk_binds_and_a_forged_digest_does_not() {
    let stored = chunk("local", "alice", "Sydney opened in 1956", "corpus");
    let allowed = authorized_retrieval("local", "alice", std::slice::from_ref(&stored)).unwrap();
    let (bound, record) = bind_citations(b"when", b"1956", vec![cite(&stored)], &allowed).unwrap();
    assert!(bound.grounded);
    assert!(record.uncertainty_note.is_none());

    let mut forged = cite(&stored);
    forged.chunk_digest = Digest32::blake3(b"AKG:RAG:CHUNK:v1\0", b"Melbourne opened in 1957");
    let (unbound, record) = bind_citations(b"when", b"1957", vec![forged], &allowed).unwrap();
    assert!(!unbound.grounded);
    assert_eq!(
        record.uncertainty_note.as_deref(),
        Some("citation is not bound to an authorized chunk")
    );
}

#[test]
fn poisoned_bytes_and_foreign_source_fail_closed() {
    let mut poisoned = chunk("local", "alice", "trusted", "corpus");
    poisoned.content = b"poisoned".to_vec();
    let err = bind_citations(b"q", b"a", vec![cite(&poisoned)], &[&poisoned]).unwrap_err();
    assert_eq!(err, "invalid retrieved chunk");

    let stored = chunk("local", "alice", "trusted", "corpus");
    let mut foreign = cite(&stored);
    foreign.source_ref = Digest32::blake3(b"AKG:RAG:SOURCE:v1\0", b"other");
    let (unbound, _) = bind_citations(
        b"q",
        b"a",
        vec![foreign],
        authorized_retrieval("local", "alice", std::slice::from_ref(&stored))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    assert!(!unbound.grounded);
}

fn cite_document(document: &Document) -> Citation {
    Citation {
        source_ref: Digest32::blake3(b"AKG:RAG:SOURCE:v1\0", document.id.as_bytes()),
        chunk_digest: Digest32::blake3(b"AKG:RAG:CHUNK:v1\0", document.text.as_bytes()),
    }
}

#[test]
fn hybrid_hit_grounds_and_an_indexed_non_hit_does_not() {
    let documents = vec![
        Document {
            id: "pay".into(),
            text: "pagamento exige aprovação humana".into(),
        },
        Document {
            id: "export".into(),
            text: "exportação exige consentimento explícito".into(),
        },
    ];
    let index = Bm25Index::new(documents.clone(), 1.2, 0.75).unwrap();
    let hybrid = HybridRetriever::new(index, 60, 1).unwrap();
    let hits = hybrid
        .retrieve("pagamento", Ok(vec!["pay".into()]))
        .unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, "pay");
    let snapshot = Bm25Index::new(documents.clone(), 1.2, 0.75).unwrap();
    let (grounded, _) = ground_retrieved(
        b"pagamento",
        b"human approval",
        vec![cite_document(&documents[0])],
        &snapshot,
        &hits,
        "local",
        "alice",
    )
    .unwrap();
    assert!(grounded.grounded);
    let (miss, _) = ground_retrieved(
        b"pagamento",
        b"consentimento",
        vec![cite_document(&documents[1])],
        &snapshot,
        &hits,
        "local",
        "alice",
    )
    .unwrap();
    assert!(!miss.grounded);
    let outsider = arkhe_rag::retrieval::Hit {
        id: "unknown".into(),
        score: 1.0,
    };
    assert_eq!(
        ground_retrieved(b"q", b"a", vec![], &snapshot, &[outsider], "local", "alice").unwrap_err(),
        "hit is outside snapshot"
    );
}

#[test]
fn included_hit_grounds_and_a_different_root_does_not() {
    let documents = vec![
        Document {
            id: "pay".into(),
            text: "pagamento exige aprovacao humana".into(),
        },
        Document {
            id: "export".into(),
            text: "exportacao exige consentimento explicito".into(),
        },
    ];
    let index = Bm25Index::new(documents.clone(), 1.2, 0.75).unwrap();
    let hits = vec![
        Hit {
            id: "pay".into(),
            score: 1.0,
        },
        Hit {
            id: "export".into(),
            score: 0.5,
        },
    ];
    let leaves = vec![
        documents[0].text.as_bytes().to_vec(),
        documents[1].text.as_bytes().to_vec(),
    ];
    let (root, proof) = build_root_and_proof(&leaves, 0).unwrap();
    assert!(!proof.is_empty());
    let (included, _) = ground_included(
        b"q",
        b"a",
        vec![cite_document(&documents[0])],
        &index,
        &hits,
        "local",
        "alice",
        0,
        &proof,
        &root,
    )
    .unwrap();
    assert!(included.grounded);
    let (other_root, other_proof) = build_root_and_proof(&leaves, 1).unwrap();
    let (not_this_leaf, _) = ground_included(
        b"q",
        b"a",
        vec![cite_document(&documents[0])],
        &index,
        &hits,
        "local",
        "alice",
        1,
        &other_proof,
        &other_root,
    )
    .unwrap();
    assert!(!not_this_leaf.grounded);
    let mut flipped = proof.clone();
    flipped[0].hash[0] ^= 1;
    let (rejected, _) = ground_included(
        b"q",
        b"a",
        vec![cite_document(&documents[0])],
        &index,
        &hits,
        "local",
        "alice",
        0,
        &flipped,
        &root,
    )
    .unwrap();
    assert!(!rejected.grounded);
}

#[test]
fn empty_hit_and_blank_identity_fail_closed() {
    let documents = vec![Document {
        id: "pay".into(),
        text: "pagamento exige aprovacao humana".into(),
    }];
    let index = Bm25Index::new(documents.clone(), 1.2, 0.75).unwrap();
    let empty = Hit {
        id: String::new(),
        score: 1.0,
    };
    assert_eq!(
        ground_retrieved(b"q", b"a", vec![], &index, &[empty], "local", "alice").unwrap_err(),
        "hit is outside snapshot"
    );
    let hit = Hit {
        id: "pay".into(),
        score: 1.0,
    };
    assert_eq!(
        ground_retrieved(
            b"q",
            b"a",
            vec![],
            &index,
            std::slice::from_ref(&hit),
            " ",
            "alice"
        )
        .unwrap_err(),
        "identity required"
    );
    assert_eq!(
        ground_retrieved(b"q", b"a", vec![], &index, &[hit], "local", " ").unwrap_err(),
        "identity required"
    );
}

#[test]
fn zero_mmr_root_is_not_a_checkpoint() {
    let documents = vec![Document {
        id: "pay".into(),
        text: "pagamento exige aprovacao humana".into(),
    }];
    let index = Bm25Index::new(documents.clone(), 1.2, 0.75).unwrap();
    let hits = vec![Hit {
        id: "pay".into(),
        score: 1.0,
    }];
    let (root, proof) = build_root_and_proof(&[documents[0].text.as_bytes().to_vec()], 0).unwrap();
    assert_ne!(root, [0u8; 32]);
    assert_eq!(
        ground_included(
            b"q",
            b"a",
            vec![cite_document(&documents[0])],
            &index,
            &hits,
            "local",
            "alice",
            0,
            &proof,
            &[0u8; 32],
        )
        .unwrap_err(),
        "unauthenticated MMR root"
    );
}
