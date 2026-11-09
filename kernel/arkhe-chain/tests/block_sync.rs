mod common;

use std::sync::Arc;

use arkhe_chain::{spawn_server, sync_canonical, ChainError, GENESIS_ACCOUNT, GENESIS_SUPPLY};

const TS: u64 = 1_700_000_000;

#[tokio::test]
async fn libp2p_loopback_syncs_the_sealed_block_and_replays_balances() {
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let client = common::peer();
    let imported = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(
        client.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 25
    );
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(client.tip().unwrap(), server_node.tip().unwrap());
    assert_eq!(client.mmr_root().unwrap(), server_node.mmr_root().unwrap());
}

#[tokio::test]
async fn sync_listens_as_the_validator_and_refuses_an_outsider() {
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let again = spawn_server(Arc::clone(&server_node)).await.unwrap();
    assert_eq!(server.local_peer_id, server_node.peer_id());
    assert_eq!(again.local_peer_id, server.local_peer_id);
    assert_ne!(common::peer().peer_id(), server_node.peer_id());

    let client = common::peer();
    let error = sync_canonical(
        &client,
        server.listen_addr.clone(),
        common::outsider().peer_id(),
    )
    .await
    .unwrap_err();
    assert_eq!(error, ChainError::P2p("peer"));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);

    let imported = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
}

#[test]
fn accepted_peers_are_only_the_validator_keys() {
    let node = common::node();
    let peers = node.accepted_peers();
    assert_eq!(
        peers
            .iter()
            .map(|peer| (peer.validator_id.as_str(), peer.peer_id.to_string()))
            .collect::<Vec<_>>(),
        vec![
            (
                "validator-a",
                "12D3KooWPqT2nMDSiXUSx5D7fasaxhxKigVhcqfkKqrLghCq9jxz".into(),
            ),
            (
                "validator-b",
                "12D3KooWLdJAwPtyQ5RFnr9wGXsQzpf3P2SeqFbYkqbfVehLu4Ns".into(),
            ),
        ]
    );
    assert_eq!(peers[0].peer_id, node.peer_id());
    let outsider = common::outsider().peer_id();
    assert!(peers.iter().all(|peer| peer.peer_id != outsider));

    let alone = common::outsider();
    let own = alone.accepted_peers();
    assert_eq!(own.len(), 1);
    assert_eq!(own[0].validator_id, "validator-c");
    assert_eq!(
        own[0].peer_id.to_string(),
        "12D3KooWBRFW3HkJCLKSWb4yG6iWRBpgNjbM4FFvNsL5T5JKTqrd"
    );
}

#[tokio::test]
async fn the_node_does_not_dial_its_own_key() {
    let node = Arc::new(common::node());
    let server = spawn_server(Arc::clone(&node)).await.unwrap();
    let error = sync_canonical(&node, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap_err();
    assert_eq!(error, ChainError::P2p("self"));
    assert_eq!(node.height().unwrap(), 0);
    assert_eq!(node.tip().unwrap(), [0; 32]);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
}

#[tokio::test]
async fn the_isolated_tip_does_not_adopt_a_longer_chain() {
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    server_node
        .ingest(common::transfer(1, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    server_node.propose_and_seal_block(TS + 1).unwrap();
    let tip = server_node.tip().unwrap();
    let tip_block = server_node.encoded_block(&tip).unwrap().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();

    let client = common::peer();
    assert_eq!(
        client.import_block(&tip_block).unwrap_err(),
        ChainError::ParentMismatch
    );
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.balance("carol").unwrap(), 0);
    assert_eq!(client.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);

    let imported = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(imported, 2);
    assert_eq!(client.height().unwrap(), 2);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.balance("carol").unwrap(), 10);
    assert_eq!(
        client.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 35
    );
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(client.tip().unwrap(), tip);
}

#[tokio::test]
async fn sync_imports_each_ancestor_until_the_remote_tip() {
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    server_node
        .ingest(common::transfer(1, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    server_node.propose_and_seal_block(TS + 1).unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();

    let client = common::peer();
    let imported = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(imported, 2);
    assert_eq!(client.height().unwrap(), 2);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.balance("carol").unwrap(), 10);
    assert_eq!(
        client.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 35
    );
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(client.tip().unwrap(), server_node.tip().unwrap());
    assert_eq!(client.mmr_root().unwrap(), server_node.mmr_root().unwrap());

    let again = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(again, 0);
    assert_eq!(client.height().unwrap(), 2);
}

#[tokio::test]
async fn sync_rejects_a_tip_that_does_not_extend_the_local_chain() {
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();

    let client = common::peer();
    client
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 25))
        .unwrap();
    client.propose_and_seal_block(TS).unwrap();
    let error = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap_err();
    assert_eq!(error, ChainError::P2p("fork"));
    assert_eq!(client.fork_count().unwrap(), 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.balance("carol").unwrap(), 25);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(
        client.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 25
    );
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(server_node.balance("bob").unwrap(), 25);
    assert_eq!(server_node.balance("carol").unwrap(), 0);
}

#[tokio::test]
async fn sync_reports_equivocation_and_keeps_the_local_tip() {
    let author = common::node();
    author
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    let remote = author.propose_and_seal_block(TS).unwrap().block.unwrap();

    let server_node = Arc::new(common::peer());
    server_node
        .import_block(&arkhe_chain::encode_block(&remote))
        .unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();

    let client = common::node();
    client
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    client.propose_and_seal_block(TS).unwrap();
    let tip = client.tip().unwrap();
    let error = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap_err();
    assert_eq!(error, ChainError::Equivocation);
    assert_eq!(client.fork_count().unwrap(), 0);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("carol").unwrap(), 10);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(
        client.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 10
    );
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
}

#[tokio::test]
async fn sync_imports_only_the_missing_suffix() {
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    let first = server_node
        .propose_and_seal_block(TS)
        .unwrap()
        .block
        .unwrap();
    server_node
        .ingest(common::transfer(1, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    server_node.propose_and_seal_block(TS + 1).unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();

    let client = common::peer();
    client
        .import_block(&arkhe_chain::encode_block(&first))
        .unwrap();
    let imported = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 2);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.balance("carol").unwrap(), 10);
    assert_eq!(client.tip().unwrap(), server_node.tip().unwrap());
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
}

#[tokio::test]
async fn sync_imports_a_chain_longer_than_the_old_window() {
    let server_node = Arc::new(common::node());
    for height in 0..65 {
        server_node
            .ingest(common::transfer(height, GENESIS_ACCOUNT, "bob", 1))
            .unwrap();
        server_node.propose_and_seal_block(TS + height).unwrap();
    }
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let client = common::peer();
    let imported = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(imported, 65);
    assert_eq!(client.height().unwrap(), 65);
    assert_eq!(client.balance("bob").unwrap(), 65);
    assert_eq!(
        client.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 65
    );
    assert_eq!(client.mmr_count().unwrap(), 65);
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(client.tip().unwrap(), server_node.tip().unwrap());
}

#[tokio::test]
async fn sync_imports_nothing_when_the_announced_tip_is_beyond_the_buffer() {
    let server_node = Arc::new(common::node());
    for height in 0..129 {
        server_node
            .ingest(common::transfer(height, GENESIS_ACCOUNT, "bob", 1))
            .unwrap();
        server_node.propose_and_seal_block(TS + height).unwrap();
    }
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let client = common::peer();
    let error = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap_err();
    assert_eq!(error, ChainError::P2p("sync-limit"));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(client.mmr_count().unwrap(), 0);
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);

    let imported = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(imported, 129);
    assert_eq!(client.height().unwrap(), 129);
    assert_eq!(client.balance("bob").unwrap(), 129);
    assert_eq!(
        client.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 129
    );
    assert_eq!(client.mmr_count().unwrap(), 129);
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(client.tip().unwrap(), server_node.tip().unwrap());
    let again = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(again, 0);
}

#[tokio::test]
async fn sync_keeps_the_cursor_past_1024_headers() {
    let server_node = Arc::new(common::node());
    for height in 0..1025 {
        server_node
            .ingest(common::transfer(height, GENESIS_ACCOUNT, "bob", 1))
            .unwrap();
        server_node.propose_and_seal_block(TS + height).unwrap();
    }
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let client = common::peer();
    for _ in 0..8 {
        let error = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
            .await
            .unwrap_err();
        assert_eq!(error, ChainError::P2p("sync-limit"));
        assert_eq!(client.height().unwrap(), 0);
        assert_eq!(client.balance("bob").unwrap(), 0);
    }
    let imported = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(imported, 1025);
    assert_eq!(client.height().unwrap(), 1025);
    assert_eq!(client.balance("bob").unwrap(), 1025);
    assert_eq!(
        client.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 1025
    );
    assert_eq!(client.mmr_count().unwrap(), 1025);
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(client.tip().unwrap(), server_node.tip().unwrap());
}
