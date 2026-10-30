#[path = "../../../verification/crates/arkhe-verify-core/tests/support/custody_chain.rs"]
mod support;

use arkhe_core::{
    custody::CustodyTransfer,
    evidence::{EvidenceCommitter, EvidenceEnvelope, EvidenceReader},
    CanonicalEncode, Digest32,
};
use arkhe_wormgraph::{
    custody::{record_transfer, CUSTODY_KIND},
    WormGraph,
};
use support::{chain, key, sign, transfer, ASSET};

#[tokio::test]
async fn chain_is_recorded_in_order_with_causal_links() {
    let graph = WormGraph::new();
    let (transfers, signed) = chain(3);
    for s in &signed {
        record_transfer(&graph, s).await.unwrap();
    }
    let head = graph
        .get(transfers[2].object_digest())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(head.kind, CUSTODY_KIND);
    assert_eq!(head.subject, CustodyTransfer::asset_subject(ASSET));
    assert_eq!(head.causal_parents, vec![transfers[1].object_digest()]);
    // Recording the same signed transfer again is idempotent.
    record_transfer(&graph, &signed[2]).await.unwrap();
}

#[tokio::test]
async fn transfer_without_recorded_predecessor_is_refused() {
    let graph = WormGraph::new();
    let (_, signed) = chain(2);
    assert_eq!(
        record_transfer(&graph, &signed[1]).await.unwrap_err(),
        "previous transfer is not in the evidence log"
    );
}

#[tokio::test]
async fn predecessor_must_be_a_transfer_of_the_same_asset() {
    let graph = WormGraph::new();
    let unrelated = Digest32([9; 32]);
    graph
        .append_verified(EvidenceEnvelope {
            record_hash: unrelated,
            kind: "WorkerExecutionRecord".into(),
            subject: Digest32::ZERO,
            payload_digest: unrelated,
            policy_digest: None,
            causal_parents: vec![],
        })
        .await
        .unwrap();
    let t = transfer(1, Some(unrelated));
    let s = sign(&t, &key(1), &key(2));
    assert_eq!(
        record_transfer(&graph, &s).await.unwrap_err(),
        "previous record is not a transfer of this asset"
    );
}

#[tokio::test]
async fn badly_signed_transfer_is_never_committed() {
    let graph = WormGraph::new();
    let (transfers, mut signed) = chain(1);
    signed[0].receiving_signature = signed[0].releasing_signature.clone();
    assert!(record_transfer(&graph, &signed[0]).await.is_err());
    assert!(graph
        .get(transfers[0].object_digest())
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
#[ignore = "requires ARKHE_TEST_RUNTIME_DATABASE_URL with migrated storage roles"]
async fn postgres_records_a_chain_and_enforces_parents() {
    let url = std::env::var("ARKHE_TEST_RUNTIME_DATABASE_URL")
        .expect("ARKHE_TEST_RUNTIME_DATABASE_URL must point to a migrated test database");
    let tenant = format!("tenant-custody-{}", std::process::id());
    let store = arkhe_wormgraph::postgres::PgWormGraph::connect(&url, &tenant)
        .await
        .unwrap();
    let (transfers, signed) = chain(4);
    assert!(record_transfer(&store, &signed[1]).await.is_err());
    for s in &signed {
        record_transfer(&store, s).await.unwrap();
    }
    let head = store
        .get(transfers[3].object_digest())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(head.causal_parents, vec![transfers[2].object_digest()]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
#[ignore = "requires ARKHE_TEST_RUNTIME_DATABASE_URL with migrated storage roles"]
async fn postgres_concurrent_forks_admit_exactly_one_successor() {
    use std::sync::Arc;
    let url = std::env::var("ARKHE_TEST_RUNTIME_DATABASE_URL")
        .expect("ARKHE_TEST_RUNTIME_DATABASE_URL must point to a migrated test database");
    let tenant = format!("tenant-custody-race-{}", std::process::id());
    let store = Arc::new(
        arkhe_wormgraph::postgres::PgWormGraph::connect(&url, &tenant)
            .await
            .unwrap(),
    );
    let (transfers, signed) = chain(1);
    record_transfer(&*store, &signed[0]).await.unwrap();

    // Sixteen distinct, validly signed transfers all extending transfer 0, and
    // eight distinct first transfers of a second asset, all written at once.
    let barrier = Arc::new(tokio::sync::Barrier::new(24));
    let mut tasks = Vec::new();
    for n in 0..24usize {
        let mut t = if n < 16 {
            transfer(1, Some(transfers[0].object_digest()))
        } else {
            let mut g = transfer(0, None);
            g.asset_id = "container:SECOND".into();
            g
        };
        t.transfer_id = format!("race-{n}");
        let recipient = 30 + n;
        t.to_party = key(recipient).verifying_key().to_bytes();
        let from = if n < 16 { key(1) } else { key(0) };
        let s = sign(&t, &from, &key(recipient));
        let (store, barrier) = (store.clone(), barrier.clone());
        tasks.push(tokio::spawn(async move {
            barrier.wait().await;
            (n < 16, record_transfer(&*store, &s).await)
        }));
    }
    let (mut successors, mut geneses) = (0, 0);
    for task in tasks {
        let (is_successor, result) = task.await.unwrap();
        if result.is_ok() {
            if is_successor {
                successors += 1;
            } else {
                geneses += 1;
            }
        }
    }
    assert_eq!((successors, geneses), (1, 1));
    // Re-recording the original transfer is still idempotent.
    record_transfer(&*store, &signed[0]).await.unwrap();
}
