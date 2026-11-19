use arkhe_core::{
    evidence::{EvidenceCommitter, EvidenceEnvelope, EvidenceReader},
    Digest32,
};
use arkhe_memory::{verify_episode_bundle, Episode, EpisodicMemory};
use arkhe_wormgraph::WormGraph;
use async_trait::async_trait;
use std::sync::Arc;

fn admitted_envelope(tag: u8) -> EvidenceEnvelope {
    EvidenceEnvelope {
        record_hash: Digest32([tag; 32]),
        kind: "work-authorization".into(),
        subject: Digest32([tag.wrapping_add(1); 32]),
        payload_digest: Digest32([tag.wrapping_add(2); 32]),
        policy_digest: Some(Digest32([tag.wrapping_add(3); 32])),
        causal_parents: vec![],
    }
}

struct FailingReader;

#[async_trait]
impl EvidenceReader for FailingReader {
    async fn get(&self, _record_hash: Digest32) -> Result<Option<EvidenceEnvelope>, String> {
        Err("storage unavailable".into())
    }
}

#[tokio::test]
async fn rejects_unreadable_zero_or_failing_evidence_ref() {
    let graph = Arc::new(WormGraph::new());
    let memory = EpisodicMemory::new(graph);

    let err_zero = memory
        .append_verified(Digest32([1; 32]), Digest32([2; 32]), Digest32::ZERO)
        .await
        .unwrap_err();
    assert!(err_zero.contains("zero"));

    let err_missing = memory
        .append_verified(Digest32([1; 32]), Digest32([2; 32]), Digest32([9; 32]))
        .await
        .unwrap_err();
    assert!(err_missing.contains("not readable"));

    let broken = EpisodicMemory::new(Arc::new(FailingReader));
    let err_io = broken
        .append_verified(Digest32([1; 32]), Digest32([2; 32]), Digest32([9; 32]))
        .await
        .unwrap_err();
    assert_eq!(err_io, "storage unavailable");
}

#[tokio::test]
async fn append_retrieve_idempotent_and_offline_mmr_proof_verification() {
    let graph = Arc::new(WormGraph::new());
    let env1 = admitted_envelope(10);
    let env2 = admitted_envelope(20);
    let env3 = admitted_envelope(30);
    graph.append_verified(env1.clone()).await.unwrap();
    graph.append_verified(env2.clone()).await.unwrap();
    graph.append_verified(env3.clone()).await.unwrap();

    let memory = EpisodicMemory::new(graph);
    let ep1 = memory
        .append_verified(Digest32([1; 32]), Digest32([2; 32]), env1.record_hash)
        .await
        .unwrap();
    // Exact replay preserves order and leaf count without duplicating the log entry.
    let ep1_replay = memory
        .append_verified(Digest32([1; 32]), Digest32([2; 32]), env1.record_hash)
        .await
        .unwrap();
    assert_eq!(ep1, ep1_replay);

    let ep2 = memory
        .append_verified(Digest32([3; 32]), Digest32([4; 32]), env2.record_hash)
        .await
        .unwrap();
    let ep3 = memory
        .append_verified(Digest32([5; 32]), Digest32([6; 32]), env3.record_hash)
        .await
        .unwrap();

    assert_eq!(memory.retrieve(ep1.episode_hash).await, Some(ep1.clone()));
    assert_eq!(memory.retrieve(ep2.episode_hash).await, Some(ep2.clone()));
    assert_eq!(memory.retrieve(ep3.episode_hash).await, Some(ep3.clone()));
    assert!(memory.retrieve(Digest32([99; 32])).await.is_none());

    let bundle2 = memory.prove_episode(ep2.episode_hash).await.unwrap();
    assert_eq!(bundle2.leaf_count, 3);
    assert_eq!(bundle2.leaf_index, 1);
    verify_episode_bundle(&bundle2, &bundle2.mmr_root).unwrap();

    // Tampered content_digest fails binding check.
    let mut bad_content = bundle2.clone();
    bad_content.episode.content_digest = Digest32([0xaa; 32]);
    assert!(verify_episode_bundle(&bad_content, &bundle2.mmr_root).is_err());

    // Tampered episode_hash + recomputed struct still fails MMR inclusion against pinned root.
    let mut swapped = bundle2.clone();
    swapped.episode.content_digest = Digest32([0xbb; 32]);
    swapped.episode.episode_hash = Episode::compute_hash(
        swapped.episode.content_digest,
        swapped.episode.trajectory_root,
        swapped.episode.evidence_ref,
    );
    assert!(verify_episode_bundle(&swapped, &bundle2.mmr_root).is_err());

    // Zero root and untrusted root fail closed.
    assert!(verify_episode_bundle(&bundle2, &[0u8; 32]).is_err());
    assert!(verify_episode_bundle(&bundle2, &[0xff; 32]).is_err());
}
