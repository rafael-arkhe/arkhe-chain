mod common;

use std::sync::Arc;

use arkhe_chain::{
    attest_configured, encode_tx_list, read_peer_file, read_status, run_operator, spawn_server,
    spawn_server_on, submit_precommit, submit_tx, sync_canonical, sync_configured, ChainError,
    ConfiguredPeer, OperatorRequest, GENESIS_ACCOUNT, GENESIS_SUPPLY,
};
use futures::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use futures::StreamExt;
use libp2p::{
    identity, noise, request_response, tcp, yamux, Multiaddr, PeerId, StreamProtocol, SwarmBuilder,
};
use serde::{Deserialize, Serialize};

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
async fn a_sibling_tip_stays_fork_and_the_next_block_extends_the_local_tip() {
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
    let tip = client.tip().unwrap();
    let imported = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(imported, 0);
    assert_eq!(client.fork_count().unwrap(), 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    client
        .ingest(common::transfer(1, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    client.propose_and_seal_block(TS + 1).unwrap();
    assert_eq!(client.height().unwrap(), 2);
    assert_eq!(client.header_at(2).unwrap().parent_hash, tip);
    assert_eq!(client.header_at(2).unwrap().timestamp, TS + 1);
    assert_eq!(client.fork_count().unwrap(), 1);
    assert_ne!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("carol").unwrap(), 25);
    assert_eq!(client.balance("bob").unwrap(), 1);
    assert_eq!(
        client.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 26
    );
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(server_node.balance("bob").unwrap(), 25);
    assert_eq!(server_node.balance("carol").unwrap(), 0);
}

#[tokio::test]
async fn a_sibling_peer_does_not_hide_a_peer_that_extends_the_local_tip() {
    let secret_c = [0x33u8; 32];
    let validators = vec![
        arkhe_chain::Validator {
            id: "validator-a".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_A).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-b".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_B).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-c".into(),
            public_key: arkhe_chain::public_key(&secret_c).unwrap(),
        },
    ];
    let accounts = common::accounts();
    let sibling = Arc::new(
        arkhe_chain::ArkheNode::new(
            "validator-a",
            &common::SECRET_A,
            validators.clone(),
            accounts.clone(),
        )
        .unwrap(),
    );
    let client = arkhe_chain::ArkheNode::new(
        "validator-b",
        &common::SECRET_B,
        validators.clone(),
        accounts.clone(),
    )
    .unwrap();
    let longer = Arc::new(
        arkhe_chain::ArkheNode::new("validator-c", &secret_c, validators, accounts).unwrap(),
    );
    client
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 25))
        .unwrap();
    client.propose_and_seal_block(TS).unwrap();
    let tip = client.tip().unwrap();
    sibling
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    sibling.propose_and_seal_block(TS).unwrap();
    let first = client.encoded_block(&tip).unwrap().unwrap();
    longer.import_block(&first).unwrap();
    longer
        .ingest(common::transfer(1, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    longer.propose_and_seal_block(TS + 1).unwrap();
    let sibling_server = spawn_server(Arc::clone(&sibling)).await.unwrap();
    let longer_server = spawn_server(Arc::clone(&longer)).await.unwrap();
    let imported = sync_configured(
        &client,
        &[
            ConfiguredPeer {
                addr: sibling_server.listen_addr.clone(),
                peer_id: sibling_server.local_peer_id,
            },
            ConfiguredPeer {
                addr: longer_server.listen_addr.clone(),
                peer_id: longer_server.local_peer_id,
            },
        ],
    )
    .await
    .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 2);
    assert_eq!(client.tip().unwrap(), longer.tip().unwrap());
    assert_eq!(client.header_at(2).unwrap().parent_hash, tip);
    assert_eq!(client.fork_count().unwrap(), 1);
    assert_eq!(client.balance("carol").unwrap(), 25);
    assert_eq!(client.balance("bob").unwrap(), 1);
    assert_eq!(sibling.height().unwrap(), 1);
    assert_ne!(sibling.tip().unwrap(), client.tip().unwrap());
}

#[tokio::test]
async fn a_shorter_extension_does_not_hide_a_longer_one() {
    let secret_c = [0x33u8; 32];
    let validators = vec![
        arkhe_chain::Validator {
            id: "validator-a".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_A).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-b".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_B).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-c".into(),
            public_key: arkhe_chain::public_key(&secret_c).unwrap(),
        },
    ];
    let accounts = common::accounts();
    let middle = Arc::new(
        arkhe_chain::ArkheNode::new(
            "validator-a",
            &common::SECRET_A,
            validators.clone(),
            accounts.clone(),
        )
        .unwrap(),
    );
    let client = arkhe_chain::ArkheNode::new(
        "validator-b",
        &common::SECRET_B,
        validators.clone(),
        accounts.clone(),
    )
    .unwrap();
    let longer = Arc::new(
        arkhe_chain::ArkheNode::new("validator-c", &secret_c, validators, accounts).unwrap(),
    );
    client
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 25))
        .unwrap();
    client.propose_and_seal_block(TS).unwrap();
    let first_hash = client.tip().unwrap();
    let first = client.encoded_block(&first_hash).unwrap().unwrap();
    middle.import_block(&first).unwrap();
    longer.import_block(&first).unwrap();
    middle
        .ingest(common::transfer(1, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    middle.propose_and_seal_block(TS + 1).unwrap();
    let second = middle
        .encoded_block(&middle.tip().unwrap())
        .unwrap()
        .unwrap();
    longer.import_block(&second).unwrap();
    longer
        .ingest(common::transfer(2, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    longer.propose_and_seal_block(TS + 2).unwrap();
    let middle_tip = middle.tip().unwrap();
    let middle_server = spawn_server(Arc::clone(&middle)).await.unwrap();
    let longer_server = spawn_server(Arc::clone(&longer)).await.unwrap();
    let imported = sync_configured(
        &client,
        &[
            ConfiguredPeer {
                addr: middle_server.listen_addr.clone(),
                peer_id: middle_server.local_peer_id,
            },
            ConfiguredPeer {
                addr: longer_server.listen_addr.clone(),
                peer_id: longer_server.local_peer_id,
            },
        ],
    )
    .await
    .unwrap();
    assert_eq!(imported, 2);
    assert_eq!(client.height().unwrap(), 3);
    assert_eq!(client.tip().unwrap(), longer.tip().unwrap());
    assert_eq!(client.header_at(2).unwrap().parent_hash, first_hash);
    assert_eq!(client.header_at(3).unwrap().parent_hash, middle_tip);
    assert_eq!(client.fork_count().unwrap(), 0);
    assert_eq!(client.balance("carol").unwrap(), 25);
    assert_eq!(client.balance("bob").unwrap(), 2);
    assert_eq!(middle.height().unwrap(), 2);
}

#[tokio::test]
async fn a_peer_whose_tip_is_already_local_does_not_change_the_chain() {
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
    client
        .ingest(common::transfer(1, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    client.propose_and_seal_block(TS + 1).unwrap();
    let tip = client.tip().unwrap();
    let again = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(again, 0);
    assert_eq!(client.height().unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.fork_count().unwrap(), 0);
    assert_eq!(client.header_at(2).unwrap().timestamp, TS + 1);
    assert_eq!(client.balance("bob").unwrap(), 26);
    assert_eq!(server_node.height().unwrap(), 1);
    assert_eq!(server_node.balance("bob").unwrap(), 25);
}

#[tokio::test]
async fn a_caught_up_peer_does_not_hide_a_longer_one() {
    let secret_c = [0x33u8; 32];
    let validators = vec![
        arkhe_chain::Validator {
            id: "validator-a".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_A).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-b".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_B).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-c".into(),
            public_key: arkhe_chain::public_key(&secret_c).unwrap(),
        },
    ];
    let accounts = common::accounts();
    let short = Arc::new(
        arkhe_chain::ArkheNode::new(
            "validator-a",
            &common::SECRET_A,
            validators.clone(),
            accounts.clone(),
        )
        .unwrap(),
    );
    let client = arkhe_chain::ArkheNode::new(
        "validator-b",
        &common::SECRET_B,
        validators.clone(),
        accounts.clone(),
    )
    .unwrap();
    let long = Arc::new(
        arkhe_chain::ArkheNode::new("validator-c", &secret_c, validators, accounts).unwrap(),
    );
    short
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    short.propose_and_seal_block(TS).unwrap();
    let first = short.encoded_block(&short.tip().unwrap()).unwrap().unwrap();
    client.import_block(&first).unwrap();
    long.import_block(&first).unwrap();
    client
        .ingest(common::transfer(1, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    client.propose_and_seal_block(TS + 1).unwrap();
    let second = client
        .encoded_block(&client.tip().unwrap())
        .unwrap()
        .unwrap();
    long.import_block(&second).unwrap();
    long.ingest(common::transfer(2, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    long.propose_and_seal_block(TS + 2).unwrap();
    let short_server = spawn_server(Arc::clone(&short)).await.unwrap();
    let long_server = spawn_server(Arc::clone(&long)).await.unwrap();
    let imported = sync_configured(
        &client,
        &[
            ConfiguredPeer {
                addr: short_server.listen_addr.clone(),
                peer_id: short_server.local_peer_id,
            },
            ConfiguredPeer {
                addr: long_server.listen_addr.clone(),
                peer_id: long_server.local_peer_id,
            },
        ],
    )
    .await
    .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 3);
    assert_eq!(client.tip().unwrap(), long.tip().unwrap());
    assert_eq!(client.fork_count().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 27);
    assert_eq!(short.height().unwrap(), 1);
    assert_eq!(long.height().unwrap(), 3);
}

#[tokio::test]
async fn a_vote_imports_the_next_block_and_ignores_one_that_does_not_extend() {
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();

    let client = Arc::new(common::peer());
    let imported = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(imported, 1);
    client
        .ingest(common::transfer(1, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    client.propose_and_seal_block(TS + 1).unwrap();
    let hash = client.block_hash_at(2).unwrap();
    let mut vote = arkhe_chain::Precommit {
        validator_id: "validator-b".into(),
        height: 2,
        round: 0,
        parts: 1,
        part_hash: hash,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: hash,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_B).unwrap();
    let stored = submit_precommit(
        &client,
        server.listen_addr.clone(),
        server.local_peer_id,
        &vote,
    )
    .await
    .unwrap();
    assert_eq!(stored, 0);
    assert_eq!(client.precommit_count(2).unwrap(), 1);
    assert_eq!(server_node.precommit_count(2).unwrap(), 1);
    assert_eq!(
        server_node.precommit_round(2, "validator-b").unwrap(),
        Some(0)
    );
    assert_eq!(server_node.height().unwrap(), 2);
    assert_eq!(server_node.tip().unwrap(), client.tip().unwrap());
    assert_eq!(server_node.fork_count().unwrap(), 0);
    assert_eq!(server_node.committed_height().unwrap(), 0);
    assert_eq!(client.committed_height().unwrap(), 0);
    assert_eq!(server_node.balance("bob").unwrap(), 26);

    let diverged = Arc::new(common::node());
    diverged
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 25))
        .unwrap();
    diverged.propose_and_seal_block(TS).unwrap();
    let diverged_tip = diverged.tip().unwrap();
    let diverged_server = spawn_server(Arc::clone(&diverged)).await.unwrap();
    let other = Arc::new(common::peer());
    other
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    other.propose_and_seal_block(TS).unwrap();
    let other_hash = other.tip().unwrap();
    let mut other_vote = arkhe_chain::Precommit {
        validator_id: "validator-b".into(),
        height: 1,
        round: 0,
        parts: 1,
        part_hash: other_hash,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: other_hash,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_precommit(&mut other_vote, &common::SECRET_B).unwrap();
    let refused = submit_precommit(
        &other,
        diverged_server.listen_addr.clone(),
        diverged_server.local_peer_id,
        &other_vote,
    )
    .await
    .unwrap_err();
    assert_eq!(refused, ChainError::Fork);
    assert_eq!(diverged.height().unwrap(), 1);
    assert_eq!(diverged.tip().unwrap(), diverged_tip);
    assert_eq!(diverged.fork_count().unwrap(), 1);
    assert_eq!(diverged.balance("carol").unwrap(), 25);
    assert_eq!(diverged.balance("bob").unwrap(), 0);
    let continued = attest_configured(
        &other,
        &common::SECRET_B,
        &[ConfiguredPeer {
            addr: diverged_server.listen_addr.clone(),
            peer_id: diverged_server.local_peer_id,
        }],
    )
    .await
    .unwrap();
    assert_eq!(continued, 0);
    assert_eq!(other.height().unwrap(), 1);
    assert_eq!(other.tip().unwrap(), other_hash);
    assert_eq!(diverged.tip().unwrap(), diverged_tip);
    assert_eq!(diverged.fork_count().unwrap(), 1);

    let fresh = Arc::new(common::node());
    let fresh_server = spawn_server(Arc::clone(&fresh)).await.unwrap();
    let skipped = submit_precommit(
        &client,
        fresh_server.listen_addr.clone(),
        fresh_server.local_peer_id,
        &vote,
    )
    .await
    .unwrap_err();
    assert_eq!(skipped, ChainError::UnknownBlock);
    assert_eq!(fresh.height().unwrap(), 0);
    assert_eq!(fresh.fork_count().unwrap(), 0);
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
async fn a_peer_behind_the_local_tip_does_not_seal_the_next_block() {
    let (peer_id, addr, task) = listen_replies(
        validator_a_key(),
        common::node().genesis_hash(),
        Some(vec![0; 32]),
        None,
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await;
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-behind-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let sealer = run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![ConfiguredPeer {
            addr: addr.clone(),
            peer_id,
        }],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    .unwrap();
    let sealed = sealer.status().unwrap();
    assert_eq!(sealed.height, 1);
    assert_eq!(sealed.mempool, 0);
    assert_eq!(sealed.forks, 0);
    let first = sealed.tip;
    assert_ne!(first, [0u8; 32]);
    submit_tx(
        &common::node(),
        sealer.listen.clone(),
        sealer.peer_id,
        &common::transfer(1, GENESIS_ACCOUNT, "bob", 1),
    )
    .await
    .unwrap();
    let held_back = sealer.catch_up().await.unwrap();
    let held = sealer.status().unwrap();
    assert_eq!(held_back, held.committed);
    assert_eq!(held.height, 1);
    assert_eq!(held.tip, first);
    assert_eq!(held.mempool, 1);
    assert_eq!(held.forks, 0);
    task.abort();
    let (_echo_id, _echo_addr, echo) = listen_replies(
        validator_a_key(),
        common::node().genesis_hash(),
        Some(first.to_vec()),
        None,
        addr.clone(),
    )
    .await;
    let echoed = sealer.catch_up().await.unwrap();
    let still = sealer.status().unwrap();
    assert_eq!(echoed, still.committed);
    assert_eq!(still.height, 1);
    assert_eq!(still.tip, first);
    assert_eq!(still.mempool, 1);
    assert_eq!(still.forks, 0);
    echo.abort();
    let (_bad_id, _bad_addr, bad) = listen_replies(
        validator_a_key(),
        common::node().genesis_hash(),
        Some(first.to_vec()),
        Some(b"nope".to_vec()),
        addr.clone(),
    )
    .await;
    let mismatched = sealer.catch_up().await.unwrap();
    let refused = sealer.status().unwrap();
    assert_eq!(mismatched, refused.committed);
    assert_eq!(refused.height, 1);
    assert_eq!(refused.tip, first);
    assert_eq!(refused.mempool, 1);
    assert_eq!(refused.forks, 0);
    bad.abort();
    let replica = common::peer();
    replica
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    replica.propose_and_seal_block(TS).unwrap();
    assert_eq!(replica.tip().unwrap(), first);
    let body = replica.encoded_block(&first).unwrap().unwrap();
    let (_caught_id, _caught_addr, caught) = listen_replies(
        validator_a_key(),
        common::node().genesis_hash(),
        Some(first.to_vec()),
        Some(body),
        addr,
    )
    .await;
    let advanced = sealer.catch_up().await.unwrap();
    let status = sealer.status().unwrap();
    assert_eq!(advanced, status.committed);
    assert_eq!(status.height, 2);
    assert_eq!(status.mempool, 0);
    assert_eq!(status.forks, 0);
    assert_ne!(status.tip, first);
    caught.abort();
    drop(sealer);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 2);
    assert_eq!(opened.block_hash_at(1).unwrap(), first);
    assert_eq!(opened.header_at(2).unwrap().parent_hash, first);
    assert_eq!(opened.balance("bob").unwrap(), 26);
    assert_eq!(opened.fork_count().unwrap(), 0);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_later_block_is_sent_when_the_height_does_not_commit() {
    let secret_c = [0x33u8; 32];
    let validators = vec![
        arkhe_chain::Validator {
            id: "validator-a".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_A).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-b".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_B).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-c".into(),
            public_key: arkhe_chain::public_key(&secret_c).unwrap(),
        },
    ];
    let accounts = common::accounts();
    let sealer = arkhe_chain::ArkheNode::new(
        "validator-a",
        &common::SECRET_A,
        validators.clone(),
        accounts.clone(),
    )
    .unwrap();
    let bob = Arc::new(
        arkhe_chain::ArkheNode::new("validator-b", &common::SECRET_B, validators, accounts)
            .unwrap(),
    );
    sealer
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    sealer.propose_and_seal_block(TS).unwrap();
    sealer
        .ingest(common::transfer(1, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    sealer.propose_and_seal_block(TS + 1).unwrap();
    let tip = sealer.tip().unwrap();
    let bob_server = spawn_server(Arc::clone(&bob)).await.unwrap();
    let committed = attest_configured(
        &sealer,
        &common::SECRET_A,
        &[ConfiguredPeer {
            addr: bob_server.listen_addr.clone(),
            peer_id: bob_server.local_peer_id,
        }],
    )
    .await
    .unwrap();
    assert_eq!(committed, 0);
    assert_eq!(sealer.committed_height().unwrap(), 0);
    assert_eq!(bob.committed_height().unwrap(), 0);
    assert_eq!(bob.height().unwrap(), 2);
    assert_eq!(bob.tip().unwrap(), tip);
    assert_eq!(sealer.tip().unwrap(), tip);
    assert_eq!(sealer.precommit_round(2, "validator-a").unwrap(), Some(0));
    assert_eq!(bob.precommit_round(2, "validator-a").unwrap(), Some(0));
    assert_eq!(bob.precommit_round(2, "validator-b").unwrap(), None);
    assert_eq!(bob.bft_commit(2).unwrap_err(), ChainError::QuorumAbsent);
    for (id, secret) in [("validator-b", common::SECRET_B), ("validator-c", secret_c)] {
        let mut vote = arkhe_chain::Precommit {
            validator_id: id.into(),
            height: 2,
            round: 0,
            parts: 1,
            part_hash: tip,
            chain_id: arkhe_chain::CHAIN_ID.into(),
            block_hash: tip,
            signature: [0u8; 64],
        };
        arkhe_chain::sign_precommit(&mut vote, &secret).unwrap();
        sealer.note_precommit(&vote).unwrap();
    }
    assert_eq!(sealer.bft_commit(2).unwrap_err(), ChainError::CommitGap);
    assert_eq!(sealer.committed_height().unwrap(), 0);
    assert_eq!(sealer.tip().unwrap(), tip);
}

#[tokio::test]
async fn a_vote_refusal_does_not_let_another_accept_finish_the_pass() {
    let (liar_id, liar_addr, task) =
        listen_sync_tip_vote_reason(common::peer().genesis_hash(), "vote").await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let client = common::peer();
    client
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    client.propose_and_seal_block(TS).unwrap();
    let tip = client.tip().unwrap();
    let alone = attest_configured(&client, &common::SECRET_B, &[liar.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::P2p("vote"));
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.committed_height().unwrap(), 0);

    let server_node = Arc::new(common::node());
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let committed = attest_configured(&client, &common::SECRET_B, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    drop(server);

    let fresh = Arc::new(common::node());
    let fresh_server = spawn_server(Arc::clone(&fresh)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-vote-refusal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: fresh_server.listen_addr.clone(),
                peer_id: fresh_server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the refused vote finished the pass"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::P2p("vote"));
    task.abort();
    drop(fresh_server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.balance("bob").unwrap(), 25);
    assert_eq!(opened.committed_height().unwrap(), 1);
    assert_eq!(fresh.height().unwrap(), 1);
    assert_eq!(fresh.tip().unwrap(), opened.tip().unwrap());
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_vote_proposer_does_not_let_another_accept_finish_the_pass() {
    let (liar_id, liar_addr, task) =
        listen_sync_tip_vote_reason(common::peer().genesis_hash(), "proposer").await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let client = common::peer();
    client
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    client.propose_and_seal_block(TS).unwrap();
    let tip = client.tip().unwrap();
    let alone = attest_configured(&client, &common::SECRET_B, &[liar.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::NotProposer);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.committed_height().unwrap(), 0);

    let server_node = Arc::new(common::node());
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let committed = attest_configured(&client, &common::SECRET_B, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    drop(server);

    let fresh = Arc::new(common::node());
    let fresh_server = spawn_server(Arc::clone(&fresh)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-vote-proposer-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: fresh_server.listen_addr.clone(),
                peer_id: fresh_server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the refused proposer finished the pass"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::NotProposer);
    task.abort();
    drop(fresh_server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.balance("bob").unwrap(), 25);
    assert_eq!(opened.committed_height().unwrap(), 1);
    assert_eq!(fresh.height().unwrap(), 1);
    assert_eq!(fresh.tip().unwrap(), opened.tip().unwrap());
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_vote_signature_does_not_let_another_accept_finish_the_pass() {
    let (liar_id, liar_addr, task) =
        listen_sync_tip_vote_reason(common::peer().genesis_hash(), "signature").await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let client = common::peer();
    client
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    client.propose_and_seal_block(TS).unwrap();
    let tip = client.tip().unwrap();
    let alone = attest_configured(&client, &common::SECRET_B, &[liar.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::BadProposerSignature);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.committed_height().unwrap(), 0);

    let server_node = Arc::new(common::node());
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let committed = attest_configured(&client, &common::SECRET_B, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    drop(server);

    let fresh = Arc::new(common::node());
    let fresh_server = spawn_server(Arc::clone(&fresh)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-vote-signature-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: fresh_server.listen_addr.clone(),
                peer_id: fresh_server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the bad signature finished the pass"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::BadProposerSignature);
    task.abort();
    drop(fresh_server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.balance("bob").unwrap(), 25);
    assert_eq!(opened.committed_height().unwrap(), 1);
    assert_eq!(fresh.height().unwrap(), 1);
    assert_eq!(fresh.tip().unwrap(), opened.tip().unwrap());
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_vote_round_does_not_let_another_accept_finish_the_pass() {
    let (liar_id, liar_addr, task) =
        listen_sync_tip_vote_reason(common::peer().genesis_hash(), "round").await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let client = common::peer();
    client
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    client.propose_and_seal_block(TS).unwrap();
    let tip = client.tip().unwrap();
    let alone = attest_configured(&client, &common::SECRET_B, &[liar.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::RoundRegression);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.committed_height().unwrap(), 0);

    let server_node = Arc::new(common::node());
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let committed = attest_configured(&client, &common::SECRET_B, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    drop(server);

    let fresh = Arc::new(common::node());
    let fresh_server = spawn_server(Arc::clone(&fresh)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-vote-round-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: fresh_server.listen_addr.clone(),
                peer_id: fresh_server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the lower round finished the pass"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::RoundRegression);
    task.abort();
    drop(fresh_server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.balance("bob").unwrap(), 25);
    assert_eq!(opened.committed_height().unwrap(), 1);
    assert_eq!(fresh.height().unwrap(), 1);
    assert_eq!(fresh.tip().unwrap(), opened.tip().unwrap());
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_vote_part_does_not_let_another_accept_finish_the_pass() {
    let (liar_id, liar_addr, task) =
        listen_sync_tip_vote_reason(common::peer().genesis_hash(), "part").await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let client = common::peer();
    client
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    client.propose_and_seal_block(TS).unwrap();
    let tip = client.tip().unwrap();
    let alone = attest_configured(&client, &common::SECRET_B, &[liar.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::BadPartSet);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.committed_height().unwrap(), 0);

    let server_node = Arc::new(common::node());
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let committed = attest_configured(&client, &common::SECRET_B, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    drop(server);

    let fresh = Arc::new(common::node());
    let fresh_server = spawn_server(Arc::clone(&fresh)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-vote-part-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: fresh_server.listen_addr.clone(),
                peer_id: fresh_server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the bad part finished the pass"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::BadPartSet);
    task.abort();
    drop(fresh_server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.balance("bob").unwrap(), 25);
    assert_eq!(opened.committed_height().unwrap(), 1);
    assert_eq!(fresh.height().unwrap(), 1);
    assert_eq!(fresh.tip().unwrap(), opened.tip().unwrap());
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_vote_chain_id_does_not_let_another_accept_finish_the_pass() {
    let (liar_id, liar_addr, task) =
        listen_sync_tip_vote_reason(common::peer().genesis_hash(), "chain-id").await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let client = common::peer();
    client
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    client.propose_and_seal_block(TS).unwrap();
    let tip = client.tip().unwrap();
    let alone = attest_configured(&client, &common::SECRET_B, &[liar.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::ChainId);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.committed_height().unwrap(), 0);

    let server_node = Arc::new(common::node());
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let committed = attest_configured(&client, &common::SECRET_B, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    drop(server);

    let fresh = Arc::new(common::node());
    let fresh_server = spawn_server(Arc::clone(&fresh)).await.unwrap();

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-vote-chain-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: fresh_server.listen_addr.clone(),
                peer_id: fresh_server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the foreign chain id finished the pass"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::ChainId);
    task.abort();
    drop(fresh_server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.balance("bob").unwrap(), 25);
    assert_eq!(opened.committed_height().unwrap(), 1);
    assert_eq!(fresh.height().unwrap(), 1);
    assert_eq!(fresh.tip().unwrap(), opened.tip().unwrap());
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_vote_genesis_does_not_let_another_accept_finish_the_pass() {
    let (liar_id, liar_addr, task) =
        listen_sync_tip_vote_reason(common::peer().genesis_hash(), "genesis").await;
    let server_node = Arc::new(common::node());
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-vote-genesis-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            ConfiguredPeer {
                addr: liar_addr,
                peer_id: liar_id,
            },
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the foreign vote finished the pass"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::P2p("genesis"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.balance("bob").unwrap(), 25);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(opened.committed_height().unwrap(), 1);
    assert_eq!(server_node.height().unwrap(), 1);
    assert_eq!(server_node.tip().unwrap(), opened.tip().unwrap());
    assert_eq!(server_node.committed_height().unwrap(), 1);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn an_outsider_does_not_let_another_peer_seal() {
    let outsider = ConfiguredPeer {
        addr: "/ip4/127.0.0.1/tcp/9".parse().unwrap(),
        peer_id: common::outsider().peer_id(),
    };
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-outsider-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            outsider,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the outsider sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::P2p("peer"));
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_missing_body_does_not_let_another_peer_seal() {
    let (missing_id, missing_addr, task) = listen_with_replies(Some(vec![0xab; 32]), None).await;
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-missing-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            ConfiguredPeer {
                addr: missing_addr,
                peer_id: missing_id,
            },
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the missing body sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::P2p("fork"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_short_announced_tip_does_not_let_another_peer_seal() {
    let (short_id, short_addr, task) = listen_with_replies(Some(vec![1, 2, 3]), None).await;
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-short-tip-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            ConfiguredPeer {
                addr: short_addr,
                peer_id: short_id,
            },
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the short tip sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::P2p("tip"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_malformed_body_does_not_let_another_peer_seal() {
    let body = b"nope".to_vec();
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-malformed-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            ConfiguredPeer {
                addr: liar_addr,
                peer_id: liar_id,
            },
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the malformed body sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Malformed);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_full_registry_does_not_let_another_peer_seal() {
    let signers: Vec<([u8; 32], String)> = (0..arkhe_chain::ATTEST_SIGNER_QUOTA)
        .map(|i| {
            let mut secret = [0xA0u8; 32];
            secret[1] = i as u8;
            (secret, format!("full-{i:02}"))
        })
        .collect();
    let mut accounts = common::accounts();
    for (secret, id) in &signers {
        accounts.push(arkhe_chain::Account {
            id: id.clone(),
            public_key: arkhe_chain::public_key(secret).unwrap(),
            mldsa_public_key: None,
        });
    }
    let filled = |id: &str, secret: &[u8; 32]| {
        arkhe_chain::ArkheNode::new(id, secret, common::validators(), accounts.clone()).unwrap()
    };
    let source = filled("validator-a", &common::SECRET_A);
    let genesis_hash = source.genesis_hash();
    let mut bodies = Vec::with_capacity(arkhe_chain::ATTEST_SIGNER_QUOTA);
    for round in 0..arkhe_chain::ATTEST_SIGNER_QUOTA {
        for (secret, id) in &signers {
            let mut nonce = [0u8; 32];
            nonce[0] = round as u8;
            let mut att = arkhe_chain::Attestation {
                version: arkhe_chain::ATTEST_VERSION,
                scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
                chain_id: arkhe_chain::CHAIN_ID.into(),
                genesis: genesis_hash,
                audience: arkhe_chain::ATTEST_AUDIENCE.into(),
                signer: id.clone(),
                nonce,
                not_before: 0,
                expires: 200,
                claim: arkhe_chain::Claim::Request {
                    task: [0; 32],
                    budget: 0,
                },
                signature: [0; 64],
            };
            arkhe_chain::sign_attestation(&mut att, secret).unwrap();
            source.submit_attestation(att).unwrap();
        }
        source.propose_and_seal_block(TS + round as u64).unwrap();
        let tip = source.tip().unwrap();
        bodies.push(source.encoded_block(&tip).unwrap().unwrap());
    }
    assert_eq!(
        source.attest_count().unwrap(),
        arkhe_chain::ATTEST_MAX_RECORDS as u64
    );
    let tip = source.tip().unwrap();
    let tip_body = bodies.last().unwrap().clone();
    let mut block = arkhe_chain::decode_block(&tip_body).unwrap();
    block.header.block_number = arkhe_chain::ATTEST_SIGNER_QUOTA as u64 + 1;
    block.header.parent_hash = tip;
    block.header.timestamp = TS + arkhe_chain::ATTEST_SIGNER_QUOTA as u64;
    block.transactions.clear();
    let (over_secret, over_id) = &signers[0];
    let mut over = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: genesis_hash,
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: over_id.clone(),
        nonce: [200; 32],
        not_before: 0,
        expires: 200,
        claim: arkhe_chain::Claim::Request {
            task: [0; 32],
            budget: 0,
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut over, over_secret).unwrap();
    block.attestations = vec![arkhe_chain::AttestOp::Admit(over)];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_replies(
        validator_a_key(),
        genesis_hash,
        Some(hash.to_vec()),
        Some(body),
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = filled("validator-b", &common::SECRET_B);
    for body in &bodies {
        alone.import_block(body).unwrap();
    }
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("full"));
    assert_eq!(
        alone.height().unwrap(),
        arkhe_chain::ATTEST_SIGNER_QUOTA as u64
    );
    assert_eq!(alone.tip().unwrap(), tip);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(filled("validator-a", &common::SECRET_A));
    for body in &bodies {
        server_node.import_block(body).unwrap();
    }
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node
        .propose_and_seal_block(TS + arkhe_chain::ATTEST_SIGNER_QUOTA as u64)
        .unwrap();
    let live_tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = filled("validator-b", &common::SECRET_B);
    for body in &bodies {
        reader.import_block(body).unwrap();
    }
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(
        reader.height().unwrap(),
        arkhe_chain::ATTEST_SIGNER_QUOTA as u64 + 1
    );
    assert_eq!(reader.tip().unwrap(), live_tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-full-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let mut genesis = String::new();
    for validator in common::validators() {
        genesis.push_str(&format!(
            "validator {} {}\n",
            validator.id,
            hex_key(&validator.public_key)
        ));
    }
    for account in &accounts {
        genesis.push_str(&format!(
            "account {} {}",
            account.id,
            hex_key(&account.public_key)
        ));
        if let Some(key) = &account.mldsa_public_key {
            genesis.push(' ');
            genesis.push_str(&hex_key(key));
        }
        genesis.push('\n');
    }
    {
        let sealer = arkhe_chain::ArkheNode::open(
            &data,
            "validator-b",
            &common::SECRET_B,
            common::validators(),
            accounts.clone(),
        )
        .unwrap();
        for body in &bodies {
            sealer.import_block(body).unwrap();
        }
    }
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis,
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS + arkhe_chain::ATTEST_SIGNER_QUOTA as u64),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the over-full attest sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("full"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        accounts.clone(),
    )
    .unwrap();
    assert_eq!(
        opened.height().unwrap(),
        arkhe_chain::ATTEST_SIGNER_QUOTA as u64 + 1
    );
    assert_eq!(opened.tip().unwrap(), live_tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), live_tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_signer_over_quota_does_not_let_another_peer_seal() {
    let source = common::node();
    for i in 0..arkhe_chain::ATTEST_SIGNER_QUOTA {
        let mut nonce = [0u8; 32];
        nonce[0] = i as u8;
        let mut att = arkhe_chain::Attestation {
            version: arkhe_chain::ATTEST_VERSION,
            scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
            chain_id: arkhe_chain::CHAIN_ID.into(),
            genesis: source.genesis_hash(),
            audience: arkhe_chain::ATTEST_AUDIENCE.into(),
            signer: GENESIS_ACCOUNT.into(),
            nonce,
            not_before: 0,
            expires: 1,
            claim: arkhe_chain::Claim::Request {
                task: [0; 32],
                budget: 0,
            },
            signature: [0; 64],
        };
        arkhe_chain::sign_attestation(&mut att, &common::GENESIS_SECRET).unwrap();
        source.submit_attestation(att).unwrap();
    }
    source.propose_and_seal_block(TS).unwrap();
    let tip = source.tip().unwrap();
    let tip_body = source.encoded_block(&tip).unwrap().unwrap();
    let mut block = arkhe_chain::decode_block(&tip_body).unwrap();
    block.header.block_number = 2;
    block.header.parent_hash = tip;
    block.header.timestamp = TS + 1;
    block.transactions.clear();
    let mut over = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [200; 32],
        not_before: 0,
        expires: 2,
        claim: arkhe_chain::Claim::Request {
            task: [0; 32],
            budget: 0,
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut over, &common::GENESIS_SECRET).unwrap();
    block.attestations = vec![arkhe_chain::AttestOp::Admit(over)];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    alone.import_block(&tip_body).unwrap();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("quota"));
    assert_eq!(alone.height().unwrap(), 1);
    assert_eq!(alone.tip().unwrap(), tip);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node.import_block(&tip_body).unwrap();
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS + 1).unwrap();
    let live_tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    reader.import_block(&tip_body).unwrap();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 2);
    assert_eq!(reader.tip().unwrap(), live_tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-quota-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    {
        let sealer = arkhe_chain::ArkheNode::open(
            &data,
            "validator-b",
            &common::SECRET_B,
            common::validators(),
            common::accounts(),
        )
        .unwrap();
        sealer.import_block(&tip_body).unwrap();
    }
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS + 1),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the over-quota attest sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("quota"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 2);
    assert_eq!(opened.tip().unwrap(), live_tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), live_tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_consumed_approval_does_not_let_another_peer_seal() {
    const AUTHOR_SECRET: [u8; 32] = [0x88; 32];
    let mut accounts = common::accounts();
    accounts.push(arkhe_chain::Account {
        id: "author-node".into(),
        public_key: arkhe_chain::public_key(&AUTHOR_SECRET).unwrap(),
        mldsa_public_key: None,
    });
    let grants = vec![
        arkhe_chain::Grant {
            delegate: GENESIS_ACCOUNT.into(),
            role: arkhe_chain::Role::Requester,
            grantor: GENESIS_ACCOUNT.into(),
            expires: 10,
        },
        arkhe_chain::Grant {
            delegate: "author-node".into(),
            role: arkhe_chain::Role::Author,
            grantor: GENESIS_ACCOUNT.into(),
            expires: 10,
        },
        arkhe_chain::Grant {
            delegate: "attacker-node".into(),
            role: arkhe_chain::Role::Evaluator,
            grantor: GENESIS_ACCOUNT.into(),
            expires: 10,
        },
        arkhe_chain::Grant {
            delegate: GENESIS_ACCOUNT.into(),
            role: arkhe_chain::Role::Approver,
            grantor: GENESIS_ACCOUNT.into(),
            expires: 10,
        },
    ];
    let granted = |id: &str, secret: &[u8; 32]| {
        arkhe_chain::ArkheNode::new_with_grants(
            id,
            secret,
            common::validators(),
            accounts.clone(),
            grants.clone(),
        )
        .unwrap()
    };
    let source = granted("validator-a", &common::SECRET_A);
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    let mut request = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [12; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Request {
            task: [0; 32],
            budget: 0,
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut request, &common::GENESIS_SECRET).unwrap();
    let request_id = request.id();
    let mut artifact = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: "author-node".into(),
        nonce: [13; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Artifact {
            request: request_id,
            artifact: [1; 32],
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut artifact, &AUTHOR_SECRET).unwrap();
    let mut evaluation = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: "attacker-node".into(),
        nonce: [14; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Evaluation {
            artifact: [1; 32],
            suite: [0; 32],
            environment: [0; 32],
            evidence: [0; 32],
            passed: true,
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut evaluation, &common::ATTACKER_SECRET).unwrap();
    let evaluation_id = evaluation.id();
    let mut approval = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [15; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Approval {
            action: [1; 32],
            artifact: [1; 32],
            evaluation: evaluation_id,
            policy: source.attest_policy_digest().unwrap(),
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut approval, &common::GENESIS_SECRET).unwrap();
    let approval_id = approval.id();
    block.attestations = vec![
        arkhe_chain::AttestOp::Admit(request),
        arkhe_chain::AttestOp::Admit(artifact),
        arkhe_chain::AttestOp::Admit(evaluation),
        arkhe_chain::AttestOp::Admit(approval),
        arkhe_chain::AttestOp::Execute {
            approval: approval_id,
            action: [1; 32],
            artifact: [1; 32],
        },
        arkhe_chain::AttestOp::Execute {
            approval: approval_id,
            action: [1; 32],
            artifact: [1; 32],
        },
    ];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_replies(
        validator_a_key(),
        source.genesis_hash(),
        Some(hash.to_vec()),
        Some(body),
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = granted("validator-b", &common::SECRET_B);
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("consumed"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(granted("validator-a", &common::SECRET_A));
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = granted("validator-b", &common::SECRET_B);
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-consumed-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let mut genesis = String::new();
    for validator in common::validators() {
        genesis.push_str(&format!(
            "validator {} {}\n",
            validator.id,
            hex_key(&validator.public_key)
        ));
    }
    for account in &accounts {
        genesis.push_str(&format!(
            "account {} {}",
            account.id,
            hex_key(&account.public_key)
        ));
        if let Some(key) = &account.mldsa_public_key {
            genesis.push(' ');
            genesis.push_str(&hex_key(key));
        }
        genesis.push('\n');
    }
    genesis.push_str("grant genesis-alloc requester genesis-alloc 10\n");
    genesis.push_str("grant author-node author genesis-alloc 10\n");
    genesis.push_str("grant attacker-node evaluator genesis-alloc 10\n");
    genesis.push_str("grant genesis-alloc approver genesis-alloc 10\n");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis,
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the consumed approval sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("consumed"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open_with_grants(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        accounts.clone(),
        grants.clone(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_shared_attest_signer_does_not_let_another_peer_seal() {
    let grants = vec![
        arkhe_chain::Grant {
            delegate: GENESIS_ACCOUNT.into(),
            role: arkhe_chain::Role::Approver,
            grantor: GENESIS_ACCOUNT.into(),
            expires: 10,
        },
        arkhe_chain::Grant {
            delegate: GENESIS_ACCOUNT.into(),
            role: arkhe_chain::Role::Evaluator,
            grantor: GENESIS_ACCOUNT.into(),
            expires: 10,
        },
    ];
    let granted = |id: &str, secret: &[u8; 32]| {
        arkhe_chain::ArkheNode::new_with_grants(
            id,
            secret,
            common::validators(),
            common::accounts(),
            grants.clone(),
        )
        .unwrap()
    };
    let source = granted("validator-a", &common::SECRET_A);
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    let mut evaluation = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [10; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Evaluation {
            artifact: [1; 32],
            suite: [0; 32],
            environment: [0; 32],
            evidence: [0; 32],
            passed: true,
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut evaluation, &common::GENESIS_SECRET).unwrap();
    let evaluation_id = evaluation.id();
    let mut approval = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [11; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Approval {
            action: [1; 32],
            artifact: [1; 32],
            evaluation: evaluation_id,
            policy: source.attest_policy_digest().unwrap(),
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut approval, &common::GENESIS_SECRET).unwrap();
    let approval_id = approval.id();
    block.attestations = vec![
        arkhe_chain::AttestOp::Admit(evaluation),
        arkhe_chain::AttestOp::Admit(approval),
        arkhe_chain::AttestOp::Execute {
            approval: approval_id,
            action: [1; 32],
            artifact: [1; 32],
        },
    ];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_replies(
        validator_a_key(),
        source.genesis_hash(),
        Some(hash.to_vec()),
        Some(body),
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = granted("validator-b", &common::SECRET_B);
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("separation"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(granted("validator-a", &common::SECRET_A));
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = granted("validator-b", &common::SECRET_B);
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-separation-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let mut genesis = operator_genesis();
    genesis.push_str("grant genesis-alloc approver genesis-alloc 10\n");
    genesis.push_str("grant genesis-alloc evaluator genesis-alloc 10\n");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis,
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the shared attest signer sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("separation"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open_with_grants(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
        grants.clone(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_failed_evaluation_does_not_let_another_peer_seal() {
    let grant = arkhe_chain::Grant {
        delegate: GENESIS_ACCOUNT.into(),
        role: arkhe_chain::Role::Approver,
        grantor: GENESIS_ACCOUNT.into(),
        expires: 10,
    };
    let granted = |id: &str, secret: &[u8; 32]| {
        arkhe_chain::ArkheNode::new_with_grants(
            id,
            secret,
            common::validators(),
            common::accounts(),
            vec![grant.clone()],
        )
        .unwrap()
    };
    let source = granted("validator-a", &common::SECRET_A);
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    let mut evaluation = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [8; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Evaluation {
            artifact: [1; 32],
            suite: [0; 32],
            environment: [0; 32],
            evidence: [0; 32],
            passed: false,
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut evaluation, &common::GENESIS_SECRET).unwrap();
    let evaluation_id = evaluation.id();
    let mut approval = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [9; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Approval {
            action: [1; 32],
            artifact: [1; 32],
            evaluation: evaluation_id,
            policy: source.attest_policy_digest().unwrap(),
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut approval, &common::GENESIS_SECRET).unwrap();
    let approval_id = approval.id();
    block.attestations = vec![
        arkhe_chain::AttestOp::Admit(evaluation),
        arkhe_chain::AttestOp::Admit(approval),
        arkhe_chain::AttestOp::Execute {
            approval: approval_id,
            action: [1; 32],
            artifact: [1; 32],
        },
    ];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_replies(
        validator_a_key(),
        source.genesis_hash(),
        Some(hash.to_vec()),
        Some(body),
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = granted("validator-b", &common::SECRET_B);
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("evaluation"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(granted("validator-a", &common::SECRET_A));
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = granted("validator-b", &common::SECRET_B);
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-evaluation-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let mut genesis = operator_genesis();
    genesis.push_str("grant genesis-alloc approver genesis-alloc 10\n");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis,
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the failed evaluation sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("evaluation"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open_with_grants(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
        vec![grant.clone()],
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_missing_evaluation_does_not_let_another_peer_seal() {
    let grant = arkhe_chain::Grant {
        delegate: GENESIS_ACCOUNT.into(),
        role: arkhe_chain::Role::Approver,
        grantor: GENESIS_ACCOUNT.into(),
        expires: 10,
    };
    let granted = |id: &str, secret: &[u8; 32]| {
        arkhe_chain::ArkheNode::new_with_grants(
            id,
            secret,
            common::validators(),
            common::accounts(),
            vec![grant.clone()],
        )
        .unwrap()
    };
    let source = granted("validator-a", &common::SECRET_A);
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    let mut att = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [7; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Approval {
            action: [1; 32],
            artifact: [1; 32],
            evaluation: [0; 32],
            policy: source.attest_policy_digest().unwrap(),
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut att, &common::GENESIS_SECRET).unwrap();
    let id = att.id();
    block.attestations = vec![
        arkhe_chain::AttestOp::Admit(att),
        arkhe_chain::AttestOp::Execute {
            approval: id,
            action: [1; 32],
            artifact: [1; 32],
        },
    ];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_replies(
        validator_a_key(),
        source.genesis_hash(),
        Some(hash.to_vec()),
        Some(body),
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = granted("validator-b", &common::SECRET_B);
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("link"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(granted("validator-a", &common::SECRET_A));
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = granted("validator-b", &common::SECRET_B);
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-link-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let mut genesis = operator_genesis();
    genesis.push_str("grant genesis-alloc approver genesis-alloc 10\n");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis,
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the missing evaluation sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("link"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open_with_grants(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
        vec![grant.clone()],
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_wrong_artifact_does_not_let_another_peer_seal() {
    let grant = arkhe_chain::Grant {
        delegate: GENESIS_ACCOUNT.into(),
        role: arkhe_chain::Role::Approver,
        grantor: GENESIS_ACCOUNT.into(),
        expires: 10,
    };
    let granted = |id: &str, secret: &[u8; 32]| {
        arkhe_chain::ArkheNode::new_with_grants(
            id,
            secret,
            common::validators(),
            common::accounts(),
            vec![grant.clone()],
        )
        .unwrap()
    };
    let source = granted("validator-a", &common::SECRET_A);
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    let mut att = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [6; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Approval {
            action: [1; 32],
            artifact: [1; 32],
            evaluation: [0; 32],
            policy: source.attest_policy_digest().unwrap(),
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut att, &common::GENESIS_SECRET).unwrap();
    let id = att.id();
    block.attestations = vec![
        arkhe_chain::AttestOp::Admit(att),
        arkhe_chain::AttestOp::Execute {
            approval: id,
            action: [1; 32],
            artifact: [0; 32],
        },
    ];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_replies(
        validator_a_key(),
        source.genesis_hash(),
        Some(hash.to_vec()),
        Some(body),
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = granted("validator-b", &common::SECRET_B);
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("artifact"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(granted("validator-a", &common::SECRET_A));
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = granted("validator-b", &common::SECRET_B);
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-artifact-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let mut genesis = operator_genesis();
    genesis.push_str("grant genesis-alloc approver genesis-alloc 10\n");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis,
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the wrong artifact sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("artifact"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open_with_grants(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
        vec![grant.clone()],
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_wrong_action_does_not_let_another_peer_seal() {
    let grant = arkhe_chain::Grant {
        delegate: GENESIS_ACCOUNT.into(),
        role: arkhe_chain::Role::Approver,
        grantor: GENESIS_ACCOUNT.into(),
        expires: 10,
    };
    let granted = |id: &str, secret: &[u8; 32]| {
        arkhe_chain::ArkheNode::new_with_grants(
            id,
            secret,
            common::validators(),
            common::accounts(),
            vec![grant.clone()],
        )
        .unwrap()
    };
    let source = granted("validator-a", &common::SECRET_A);
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    let mut att = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [5; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Approval {
            action: [1; 32],
            artifact: [0; 32],
            evaluation: [0; 32],
            policy: source.attest_policy_digest().unwrap(),
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut att, &common::GENESIS_SECRET).unwrap();
    let id = att.id();
    block.attestations = vec![
        arkhe_chain::AttestOp::Admit(att),
        arkhe_chain::AttestOp::Execute {
            approval: id,
            action: [0; 32],
            artifact: [0; 32],
        },
    ];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_replies(
        validator_a_key(),
        source.genesis_hash(),
        Some(hash.to_vec()),
        Some(body),
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = granted("validator-b", &common::SECRET_B);
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("action"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(granted("validator-a", &common::SECRET_A));
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = granted("validator-b", &common::SECRET_B);
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-action-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let mut genesis = operator_genesis();
    genesis.push_str("grant genesis-alloc approver genesis-alloc 10\n");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis,
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the wrong action sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("action"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open_with_grants(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
        vec![grant.clone()],
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_wrong_policy_does_not_let_another_peer_seal() {
    let grant = arkhe_chain::Grant {
        delegate: GENESIS_ACCOUNT.into(),
        role: arkhe_chain::Role::Approver,
        grantor: GENESIS_ACCOUNT.into(),
        expires: 10,
    };
    let granted = |id: &str, secret: &[u8; 32]| {
        arkhe_chain::ArkheNode::new_with_grants(
            id,
            secret,
            common::validators(),
            common::accounts(),
            vec![grant.clone()],
        )
        .unwrap()
    };
    let source = granted("validator-a", &common::SECRET_A);
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    let mut att = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [4; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Approval {
            action: [0; 32],
            artifact: [0; 32],
            evaluation: [0; 32],
            policy: [0; 32],
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut att, &common::GENESIS_SECRET).unwrap();
    let id = att.id();
    block.attestations = vec![
        arkhe_chain::AttestOp::Admit(att),
        arkhe_chain::AttestOp::Execute {
            approval: id,
            action: [0; 32],
            artifact: [0; 32],
        },
    ];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_replies(
        validator_a_key(),
        source.genesis_hash(),
        Some(hash.to_vec()),
        Some(body),
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = granted("validator-b", &common::SECRET_B);
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("policy"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(granted("validator-a", &common::SECRET_A));
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = granted("validator-b", &common::SECRET_B);
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-policy-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let mut genesis = operator_genesis();
    genesis.push_str("grant genesis-alloc approver genesis-alloc 10\n");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis,
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the wrong policy sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("policy"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open_with_grants(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
        vec![grant.clone()],
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_request_execution_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    let mut att = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [3; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Request {
            task: [0; 32],
            budget: 0,
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut att, &common::GENESIS_SECRET).unwrap();
    let id = att.id();
    block.attestations = vec![
        arkhe_chain::AttestOp::Admit(att),
        arkhe_chain::AttestOp::Execute {
            approval: id,
            action: [0; 32],
            artifact: [0; 32],
        },
    ];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("kind"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-kind-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the request execution sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("kind"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_unknown_approval_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    block.attestations = vec![arkhe_chain::AttestOp::Execute {
        approval: [0; 32],
        action: [0; 32],
        artifact: [0; 32],
    }];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("unknown"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-unknown-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the unknown approval sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("unknown"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_ungranted_revocation_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    let mut att = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [2; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Revocation {
            delegate: "bob".into(),
            role: arkhe_chain::Role::Approver,
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut att, &common::GENESIS_SECRET).unwrap();
    block.attestations = vec![arkhe_chain::AttestOp::Admit(att)];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("authority"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-authority-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the ungranted revocation sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("authority"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_replayed_attest_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    let mut att = arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: GENESIS_ACCOUNT.into(),
        nonce: [1; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Request {
            task: [0; 32],
            budget: 0,
        },
        signature: [0; 64],
    };
    arkhe_chain::sign_attestation(&mut att, &common::GENESIS_SECRET).unwrap();
    block.attestations = vec![
        arkhe_chain::AttestOp::Admit(att.clone()),
        arkhe_chain::AttestOp::Admit(att),
    ];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("replay"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-replay-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the replayed attest sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("replay"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_closed_attest_window_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    block.attestations = vec![arkhe_chain::AttestOp::Admit(arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        genesis: source.genesis_hash(),
        audience: arkhe_chain::ATTEST_AUDIENCE.into(),
        signer: "a".into(),
        nonce: [0; 32],
        not_before: 2,
        expires: 3,
        claim: arkhe_chain::Claim::Request {
            task: [0; 32],
            budget: 0,
        },
        signature: [0; 64],
    })];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("window"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-window-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the closed attest window sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("window"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_foreign_attest_domain_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    block.attestations = vec![arkhe_chain::AttestOp::Admit(arkhe_chain::Attestation {
        version: arkhe_chain::ATTEST_VERSION,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: "other".into(),
        genesis: [0; 32],
        audience: "a".into(),
        signer: "a".into(),
        nonce: [0; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Request {
            task: [0; 32],
            budget: 0,
        },
        signature: [0; 64],
    })];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("domain"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-domain-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the foreign attest domain sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("domain"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_bad_attest_version_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions.clear();
    block.attestations = vec![arkhe_chain::AttestOp::Admit(arkhe_chain::Attestation {
        version: 0,
        scheme: arkhe_chain::ATTEST_SCHEME_ED25519,
        chain_id: "a".into(),
        genesis: [0; 32],
        audience: "a".into(),
        signer: "a".into(),
        nonce: [0; 32],
        not_before: 0,
        expires: 1,
        claim: arkhe_chain::Claim::Request {
            task: [0; 32],
            budget: 0,
        },
        signature: [0; 64],
    })];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Attest("version"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-version-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the bad attest version sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Attest("version"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_bad_account_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    let mut tx = common::transfer(0, GENESIS_ACCOUNT, "bob", 1);
    tx.sender = "bob!".into();
    block.transactions = vec![tx];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::BadAccount);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-bad-account-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the bad account sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::BadAccount);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_short_mldsa_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    let mut tx = common::transfer(0, GENESIS_ACCOUNT, "bob", 1);
    tx.signature_mldsa = vec![0];
    block.transactions = vec![tx];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::BadSignatureLength);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-short-mldsa-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the short mldsa sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::BadSignatureLength);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_long_payload_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    let mut tx = common::transfer(0, GENESIS_ACCOUNT, "bob", 1);
    tx.payload = vec![0; 4097];
    block.transactions = vec![tx];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Malformed);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-long-payload-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the long payload sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Malformed);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_bad_verdict_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    let mut tx = common::transfer(0, GENESIS_ACCOUNT, "bob", 1);
    tx.payload = vec![0];
    block.transactions = vec![tx];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Admission("verdict"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-verdict-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the bad verdict sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Admission("verdict"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_foreign_subject_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    let mut tx = common::transfer(0, GENESIS_ACCOUNT, "bob", 1);
    tx.payload = common::transfer(0, GENESIS_ACCOUNT, "bob", 2).payload;
    block.transactions = vec![tx];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Admission("subject"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-subject-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the foreign subject sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Admission("subject"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_rejected_verdict_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions = vec![common::rejected_transfer(0, GENESIS_ACCOUNT, "bob", 1)];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::Admission("not-allow"));
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-reject-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the rejected verdict sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::Admission("not-allow"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_short_balance_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions = vec![common::transfer(
        0,
        GENESIS_ACCOUNT,
        "bob",
        GENESIS_SUPPLY + 1,
    )];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::InsufficientBalance);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-balance-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the short balance sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::InsufficientBalance);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_self_transfer_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions = vec![common::transfer(0, GENESIS_ACCOUNT, GENESIS_ACCOUNT, 1)];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::SelfTransfer);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-self-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the self transfer sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::SelfTransfer);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_bad_nonce_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions = vec![common::transfer(1, GENESIS_ACCOUNT, "bob", 1)];
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::BadNonce);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-nonce-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the bad nonce sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::BadNonce);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_bad_sender_signature_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.transactions[0].sender_signature[0] ^= 0xff;
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::UnverifiedSignature);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-sender-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the bad sender signature sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::UnverifiedSignature);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_zero_timestamp_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.header.timestamp = 0;
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::BadTimestamp);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-time-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the zero timestamp sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::BadTimestamp);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_state_mismatch_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.header.state_root[0] ^= 0xff;
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::StateMismatch);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-state-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the state mismatch sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::StateMismatch);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_parent_mismatch_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.header.block_number = 2;
    arkhe_chain::sign_proposer(&mut block, &common::SECRET_A).unwrap();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::ParentMismatch);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-parent-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the parent mismatch sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::ParentMismatch);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn an_unknown_proposer_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.header.proposer = "stranger".into();
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::NotProposer);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-stranger-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the unknown proposer sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::NotProposer);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_bad_proposer_signature_does_not_let_another_peer_seal() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    source.propose_and_seal_block(TS).unwrap();
    let mut block = arkhe_chain::decode_block(
        &source
            .encoded_block(&source.tip().unwrap())
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    block.header.proposer_signature[0] ^= 0xff;
    let body = arkhe_chain::encode_block(&block);
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let alone = common::peer();
    let alone_error = sync_configured(&alone, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone_error, ChainError::BadProposerSignature);
    assert_eq!(alone.height().unwrap(), 0);
    assert_eq!(alone.balance("bob").unwrap(), 0);
    assert_eq!(alone.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let reader = common::peer();
    let imported = sync_configured(&reader, &[liar.clone(), live])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(reader.height().unwrap(), 1);
    assert_eq!(reader.tip().unwrap(), tip);
    assert_eq!(reader.balance("bob").unwrap(), 4);
    assert_eq!(reader.fork_count().unwrap(), 0);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-proposer-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            liar,
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the bad proposer signature sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::BadProposerSignature);
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_bad_body_hash_does_not_let_another_peer_seal() {
    let (liar_id, liar_addr, task) =
        listen_with_replies(Some(vec![0x44; 32]), Some(b"nope".to_vec())).await;
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-hash-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            ConfiguredPeer {
                addr: liar_addr,
                peer_id: liar_id,
            },
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the bad hash sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::P2p("hash"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_different_genesis_does_not_let_another_peer_seal() {
    let (foreign_id, foreign_addr, task) = listen_replies(
        validator_a_key(),
        [0xab; 32],
        Some(vec![0; 32]),
        None,
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await;
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-foreign-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let error = match run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            ConfiguredPeer {
                addr: foreign_addr,
                peer_id: foreign_id,
            },
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    {
        Ok(_) => panic!("the foreign genesis sealed"),
        Err(error) => error,
    };
    assert_eq!(error, ChainError::P2p("genesis"));
    task.abort();
    drop(server);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_missed_peer_does_not_let_another_answer_seal() {
    let probe = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = probe.local_addr().unwrap().port();
    drop(probe);
    let dead: Multiaddr = format!("/ip4/127.0.0.1/tcp/{port}").parse().unwrap();
    let live_node = Arc::new(common::node());
    let live = spawn_server(Arc::clone(&live_node)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-missed-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let sealer = run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![
            ConfiguredPeer {
                addr: dead.clone(),
                peer_id: live.local_peer_id,
            },
            ConfiguredPeer {
                addr: live.listen_addr.clone(),
                peer_id: live.local_peer_id,
            },
        ],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    .unwrap();
    let waiting = sealer.status().unwrap();
    assert_eq!(waiting.height, 0);
    assert_eq!(waiting.committed, 0);
    assert_eq!(waiting.mempool, 1);
    assert_eq!(waiting.forks, 0);
    assert_eq!(waiting.tip, [0u8; 32]);
    let arrived = Arc::new(common::node());
    let server = spawn_server_on(Arc::clone(&arrived), dead).await.unwrap();
    let finished = sealer.catch_up().await.unwrap();
    assert_eq!(finished, 1);
    let status = sealer.status().unwrap();
    assert_eq!(status.height, 1);
    assert_eq!(status.committed, 1);
    assert_eq!(status.mempool, 0);
    assert_eq!(status.forks, 0);
    let tip = status.tip;
    drop(server);
    drop(live);
    drop(sealer);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 25);
    assert_eq!(opened.fork_count().unwrap(), 0);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_submitted_transaction_does_not_wait_on_a_silent_peer() {
    let (peer_id, addr, task) = listen_and_hold().await;
    assert_eq!(peer_id, common::node().peer_id());
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-reply-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("sealer");
    let sealer = run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![ConfiguredPeer {
            addr: addr.clone(),
            peer_id,
        }],
        once: false,
        txs: Vec::new(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    .unwrap();
    let sender = common::node();
    let started = std::time::Instant::now();
    submit_tx(
        &sender,
        sealer.listen.clone(),
        sealer.peer_id,
        &common::transfer(0, GENESIS_ACCOUNT, "bob", 25),
    )
    .await
    .unwrap();
    assert!(started.elapsed() < std::time::Duration::from_secs(5));
    let waiting = sealer.status().unwrap();
    assert_eq!(waiting.height, 0);
    assert_eq!(waiting.committed, 0);
    assert_eq!(waiting.mempool, 1);
    assert_eq!(waiting.forks, 0);
    assert_eq!(waiting.tip, [0u8; 32]);
    task.abort();
    let server_node = Arc::new(common::node());
    let server = spawn_server_on(Arc::clone(&server_node), addr)
        .await
        .unwrap();
    let finished = sealer.catch_up().await.unwrap();
    assert_eq!(finished, 1);
    let status = sealer.status().unwrap();
    assert_eq!(status.height, 1);
    assert_eq!(status.committed, 1);
    assert_eq!(status.mempool, 0);
    assert_eq!(status.forks, 0);
    let tip = status.tip;
    drop(server);
    drop(sealer);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 25);
    assert_eq!(opened.fork_count().unwrap(), 0);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_seal_waits_until_a_named_peer_has_answered() {
    let probe = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = probe.local_addr().unwrap().port();
    drop(probe);
    let addr: Multiaddr = format!("/ip4/127.0.0.1/tcp/{port}").parse().unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-wait-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let handle = run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![ConfiguredPeer {
            addr: addr.clone(),
            peer_id: common::node().peer_id(),
        }],
        once: true,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    .unwrap();
    let waiting = handle.status().unwrap();
    assert_eq!(waiting.height, 0);
    assert_eq!(waiting.committed, 0);
    assert_eq!(waiting.mempool, 1);
    assert_eq!(waiting.forks, 0);
    assert_eq!(waiting.tip, [0u8; 32]);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server_on(Arc::clone(&server_node), addr)
        .await
        .unwrap();
    let finished = handle.catch_up().await.unwrap();
    assert_eq!(finished, 1);
    let status = handle.status().unwrap();
    assert_eq!(status.height, 1);
    assert_eq!(status.tip, tip);
    assert_eq!(status.forks, 0);
    assert_eq!(status.mempool, 0);
    drop(server);
    drop(handle);
    let opened = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 1);
    assert_eq!(opened.tip().unwrap(), tip);
    assert_eq!(opened.balance("bob").unwrap(), 4);
    assert_eq!(opened.fork_count().unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_refused_dial_keeps_the_operator_up_until_the_peer_answers() {
    let probe = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = probe.local_addr().unwrap().port();
    drop(probe);
    let addr: Multiaddr = format!("/ip4/127.0.0.1/tcp/{port}").parse().unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-retry-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let started = std::time::Instant::now();
    let handle = run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![ConfiguredPeer {
            addr: addr.clone(),
            peer_id: common::node().peer_id(),
        }],
        once: true,
        txs: Vec::new(),
        seal_at: None,
        announce: None,
    })
    .await
    .unwrap();
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    let waiting = handle.status().unwrap();
    assert_eq!(waiting.height, 0);
    assert_eq!(waiting.committed, 0);
    assert_eq!(waiting.forks, 0);
    assert!(std::fs::read(&data).unwrap().starts_with(b"AKGCHNS7"));
    let again = handle.catch_up().await.unwrap();
    assert_eq!(again, 0);
    assert_eq!(handle.status().unwrap().height, 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server_on(Arc::clone(&server_node), addr)
        .await
        .unwrap();
    let finished = handle.catch_up().await.unwrap();
    assert_eq!(finished, 1);
    let status = handle.status().unwrap();
    assert_eq!(status.height, 1);
    assert_eq!(status.committed, 1);
    assert_eq!(status.tip, tip);
    assert_eq!(status.forks, 0);
    drop(server);
    let stayed = handle.catch_up().await.unwrap();
    assert_eq!(stayed, 1);
    let after = handle.status().unwrap();
    assert_eq!(after.height, 1);
    assert_eq!(after.committed, 1);
    assert_eq!(after.tip, tip);
    assert_eq!(after.forks, 0);
    assert_eq!(server_node.tip().unwrap(), tip);
    drop(handle);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_sync_limit_keeps_the_operator_up_and_the_next_call_finishes() {
    let server_node = Arc::new(common::node());
    for height in 0..129 {
        server_node
            .ingest(common::transfer(height, GENESIS_ACCOUNT, "bob", 1))
            .unwrap();
        server_node.propose_and_seal_block(TS + height).unwrap();
    }
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-limit-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let handle = run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![ConfiguredPeer {
            addr: server.listen_addr.clone(),
            peer_id: server.local_peer_id,
        }],
        once: true,
        txs: Vec::new(),
        seal_at: None,
        announce: None,
    })
    .await
    .unwrap();
    let paused = handle.status().unwrap();
    assert_eq!(paused.height, 0);
    assert_eq!(paused.committed, 0);
    assert!(std::fs::read(&data).unwrap().starts_with(b"AKGCHNS8"));
    let finished = handle.catch_up().await.unwrap();
    assert_eq!(finished, 129);
    let status = handle.status().unwrap();
    assert_eq!(status.height, 129);
    assert_eq!(status.committed, 129);
    assert_eq!(status.tip, tip);
    assert_eq!(status.forks, 0);
    drop(handle);
    let again = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(again.height().unwrap(), 129);
    assert_eq!(again.balance("bob").unwrap(), 129);
    assert_eq!(again.tip().unwrap(), tip);
    assert_eq!(again.committed_height().unwrap(), 129);
    assert_eq!(server_node.committed_height().unwrap(), 129);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert!(std::fs::read(&data).unwrap().starts_with(b"AKGCHNS9"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_sync_limit_does_not_hide_a_peer_that_extends_the_local_tip() {
    let long_node = Arc::new(common::node());
    for height in 0..129 {
        long_node
            .ingest(common::transfer(height, GENESIS_ACCOUNT, "bob", 1))
            .unwrap();
        long_node.propose_and_seal_block(TS + height).unwrap();
    }
    let first_hash = long_node.block_hash_at(1).unwrap();
    let first = long_node.encoded_block(&first_hash).unwrap().unwrap();
    let short_node = Arc::new(common::node());
    short_node.import_block(&first).unwrap();
    let long_server = spawn_server(Arc::clone(&long_node)).await.unwrap();
    let short_server = spawn_server(Arc::clone(&short_node)).await.unwrap();
    let client = common::peer();
    let long = ConfiguredPeer {
        addr: long_server.listen_addr.clone(),
        peer_id: long_server.local_peer_id,
    };
    let short = ConfiguredPeer {
        addr: short_server.listen_addr.clone(),
        peer_id: short_server.local_peer_id,
    };
    let imported = sync_configured(&client, &[long.clone(), short.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), short_node.tip().unwrap());
    assert_eq!(client.header_at(1).unwrap().parent_hash, [0; 32]);
    assert_eq!(client.balance("bob").unwrap(), 1);
    assert_eq!(client.fork_count().unwrap(), 0);
    assert_eq!(short_node.height().unwrap(), 1);

    let rest = sync_configured(&client, &[long, short]).await.unwrap();
    assert_eq!(rest, 128);
    assert_eq!(client.height().unwrap(), 129);
    assert_eq!(client.tip().unwrap(), long_node.tip().unwrap());
    assert_eq!(client.balance("bob").unwrap(), 129);
    assert_eq!(client.fork_count().unwrap(), 0);
    assert_eq!(long_node.height().unwrap(), 129);
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

#[tokio::test]
async fn a_changed_announced_tip_discards_the_retained_bodies() {
    let long_node = Arc::new(common::node());
    for height in 0..129 {
        long_node
            .ingest(common::transfer(height, GENESIS_ACCOUNT, "bob", 1))
            .unwrap();
        long_node.propose_and_seal_block(TS + height).unwrap();
    }
    let long_server = spawn_server(Arc::clone(&long_node)).await.unwrap();
    let client = common::peer();
    let error = sync_canonical(
        &client,
        long_server.listen_addr.clone(),
        long_server.local_peer_id,
    )
    .await
    .unwrap_err();
    assert_eq!(error, ChainError::P2p("sync-limit"));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);

    let short_node = Arc::new(common::node());
    short_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 7))
        .unwrap();
    short_node.propose_and_seal_block(TS + 10_000).unwrap();
    assert_ne!(short_node.tip().unwrap(), long_node.tip().unwrap());
    let short_server = spawn_server(Arc::clone(&short_node)).await.unwrap();
    assert_eq!(short_server.local_peer_id, long_server.local_peer_id);

    let imported = sync_canonical(
        &client,
        short_server.listen_addr.clone(),
        short_server.local_peer_id,
    )
    .await
    .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.balance("bob").unwrap(), 7);
    assert_eq!(client.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY - 7);
    assert_eq!(client.mmr_count().unwrap(), 1);
    assert_eq!(client.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(client.tip().unwrap(), short_node.tip().unwrap());
}

#[tokio::test]
async fn a_reopened_client_resumes_the_retained_walk() {
    let server_node = Arc::new(common::node());
    for height in 0..129 {
        server_node
            .ingest(common::transfer(height, GENESIS_ACCOUNT, "bob", 1))
            .unwrap();
        server_node.propose_and_seal_block(TS + height).unwrap();
    }
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let path = std::env::temp_dir().join(format!(
        "arkhe-chain-sync-reopen-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let client = arkhe_chain::ArkheNode::open(
        &path,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    let before = std::fs::read(&path).unwrap();
    let error = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap_err();
    assert_eq!(error, ChainError::P2p("sync-limit"));
    assert_eq!(client.height().unwrap(), 0);
    let saved = std::fs::read(&path).unwrap();
    assert!(saved.starts_with(b"AKGCHNS8"));
    assert_ne!(saved, before);
    drop(client);

    let reopened = arkhe_chain::ArkheNode::open(
        &path,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    let imported = sync_canonical(&reopened, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap();
    assert_eq!(imported, 129);
    assert_eq!(reopened.height().unwrap(), 129);
    assert_eq!(reopened.balance("bob").unwrap(), 129);
    assert_eq!(
        reopened.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 129
    );
    assert_eq!(reopened.mmr_count().unwrap(), 129);
    assert_eq!(reopened.tip().unwrap(), server_node.tip().unwrap());
    assert!(std::fs::read(&path).unwrap().starts_with(b"AKGCHNS7"));
    let _ = std::fs::remove_file(&path);
}

#[tokio::test]
async fn a_failed_dial_returns_before_thirty_seconds() {
    let client = common::peer();
    let addr = "/ip4/127.0.0.1/tcp/1".parse().unwrap();
    let started = std::time::Instant::now();
    let error = sync_canonical(&client, addr, common::node().peer_id())
        .await
        .unwrap_err();
    assert_eq!(error, ChainError::P2p("dial-failure"));
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
}

#[tokio::test]
async fn an_unanswered_peer_does_not_hide_a_peer_that_extends_the_local_tip() {
    let client = common::peer();
    let dead = ConfiguredPeer {
        addr: "/ip4/127.0.0.1/tcp/1".parse().unwrap(),
        peer_id: common::node().peer_id(),
    };
    let started = std::time::Instant::now();
    let alone = sync_configured(&client, &[dead.clone()]).await.unwrap_err();
    assert_eq!(alone, ChainError::P2p("dial-failure"));
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let started = std::time::Instant::now();
    let imported = sync_configured(&client, &[dead.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);

    let started = std::time::Instant::now();
    let committed = attest_configured(&client, &common::SECRET_B, &[dead, live])
        .await
        .unwrap();
    assert_eq!(committed, 1);
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
}

#[tokio::test]
async fn a_chosen_listen_address_serves_the_sealed_block() {
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let listen = "/ip4/127.0.0.1/tcp/0".parse().unwrap();
    let server = spawn_server_on(Arc::clone(&server_node), listen)
        .await
        .unwrap();
    assert!(server
        .listen_addr
        .to_string()
        .starts_with("/ip4/127.0.0.1/tcp/"));
    let client = common::peer();
    let imported = sync_configured(
        &client,
        &[ConfiguredPeer {
            addr: server.listen_addr.clone(),
            peer_id: server.local_peer_id,
        }],
    )
    .await
    .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.balance("bob").unwrap(), 25);
}

#[tokio::test]
async fn a_remote_precommit_records_the_height_without_changing_the_tip() {
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let mut local = arkhe_chain::Precommit {
        validator_id: "validator-a".into(),
        height: 1,
        round: 0,
        parts: 1,
        part_hash: tip,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: tip,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_precommit(&mut local, &common::SECRET_A).unwrap();
    server_node.note_precommit(&local).unwrap();
    let server = spawn_server_on(
        Arc::clone(&server_node),
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await
    .unwrap();

    let outsider = common::outsider();
    assert_eq!(
        submit_precommit(
            &outsider,
            server.listen_addr.clone(),
            server.local_peer_id,
            &local
        )
        .await
        .unwrap_err(),
        ChainError::P2p("peer")
    );

    let client = common::peer();
    let imported = sync_configured(
        &client,
        &[ConfiguredPeer {
            addr: server.listen_addr.clone(),
            peer_id: server.local_peer_id,
        }],
    )
    .await
    .unwrap();
    assert_eq!(imported, 1);
    let mut remote = arkhe_chain::Precommit {
        validator_id: "validator-b".into(),
        height: 1,
        round: 0,
        parts: 1,
        part_hash: tip,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: tip,
        signature: [0u8; 64],
    };
    let started = std::time::Instant::now();
    assert_eq!(
        submit_precommit(
            &client,
            server.listen_addr.clone(),
            server.local_peer_id,
            &remote
        )
        .await
        .unwrap_err(),
        ChainError::BadProposerSignature
    );
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.precommit_count(1).unwrap(), 0);
    assert_eq!(client.committed_height().unwrap(), 0);
    remote.block_hash[0] ^= 1;
    remote.part_hash = remote.block_hash;
    arkhe_chain::sign_precommit(&mut remote, &common::SECRET_B).unwrap();
    assert_eq!(
        submit_precommit(
            &client,
            server.listen_addr.clone(),
            server.local_peer_id,
            &remote
        )
        .await
        .unwrap_err(),
        ChainError::UnknownBlock
    );
    assert_eq!(server_node.precommit_count(1).unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 0);
    remote.block_hash = tip;
    remote.part_hash = tip;
    arkhe_chain::sign_precommit(&mut remote, &common::SECRET_B).unwrap();
    let committed = submit_precommit(
        &client,
        server.listen_addr.clone(),
        server.local_peer_id,
        &remote,
    )
    .await
    .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(server_node.balance("bob").unwrap(), 25);
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
}

#[tokio::test]
async fn a_receiver_signs_the_canonical_height_it_had_not_voted() {
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server_on(
        Arc::clone(&server_node),
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await
    .unwrap();
    let client = common::peer();
    sync_configured(
        &client,
        &[ConfiguredPeer {
            addr: server.listen_addr.clone(),
            peer_id: server.local_peer_id,
        }],
    )
    .await
    .unwrap();
    let mut remote = arkhe_chain::Precommit {
        validator_id: "validator-b".into(),
        height: 1,
        round: 0,
        parts: 1,
        part_hash: tip,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: tip,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_precommit(&mut remote, &common::SECRET_B).unwrap();
    let committed = submit_precommit(
        &client,
        server.listen_addr.clone(),
        server.local_peer_id,
        &remote,
    )
    .await
    .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(client.tip().unwrap(), tip);
}

#[tokio::test]
async fn a_third_validator_records_the_vote_it_did_not_hear_directly() {
    let secret_c = [0x33u8; 32];
    let validators = vec![
        arkhe_chain::Validator {
            id: "validator-a".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_A).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-b".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_B).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-c".into(),
            public_key: arkhe_chain::public_key(&secret_c).unwrap(),
        },
    ];
    let accounts = common::accounts();
    let sealer = arkhe_chain::ArkheNode::new(
        "validator-a",
        &common::SECRET_A,
        validators.clone(),
        accounts.clone(),
    )
    .unwrap();
    let bob = Arc::new(
        arkhe_chain::ArkheNode::new(
            "validator-b",
            &common::SECRET_B,
            validators.clone(),
            accounts.clone(),
        )
        .unwrap(),
    );
    let carol = Arc::new(
        arkhe_chain::ArkheNode::new("validator-c", &secret_c, validators, accounts).unwrap(),
    );
    sealer
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    sealer.propose_and_seal_block(TS).unwrap();
    let tip = sealer.tip().unwrap();
    let bob_server = spawn_server(Arc::clone(&bob)).await.unwrap();
    let carol_server = spawn_server(Arc::clone(&carol)).await.unwrap();
    let committed = attest_configured(
        &sealer,
        &common::SECRET_A,
        &[
            ConfiguredPeer {
                addr: bob_server.listen_addr.clone(),
                peer_id: bob_server.local_peer_id,
            },
            ConfiguredPeer {
                addr: carol_server.listen_addr.clone(),
                peer_id: carol_server.local_peer_id,
            },
        ],
    )
    .await
    .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(sealer.committed_height().unwrap(), 1);
    assert_eq!(bob.committed_height().unwrap(), 1);
    assert_eq!(carol.committed_height().unwrap(), 1);
    assert_eq!(sealer.precommit_count(1).unwrap(), 3);
    assert_eq!(bob.precommit_count(1).unwrap(), 3);
    assert_eq!(carol.precommit_count(1).unwrap(), 3);
    assert_eq!(sealer.tip().unwrap(), tip);
    assert_eq!(bob.tip().unwrap(), tip);
    assert_eq!(carol.tip().unwrap(), tip);
    assert_eq!(sealer.height().unwrap(), 1);
    assert_eq!(bob.precommit_round(1, "validator-c").unwrap(), Some(0));
    assert_eq!(carol.precommit_round(1, "validator-b").unwrap(), Some(0));
}

#[tokio::test]
async fn the_operator_attests_the_synced_height_without_changing_the_tip() {
    let lonely = common::peer();
    assert_eq!(
        attest_configured(&lonely, &common::SECRET_B, &[])
            .await
            .unwrap(),
        0
    );

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let mut local = arkhe_chain::Precommit {
        validator_id: "validator-a".into(),
        height: 1,
        round: 0,
        parts: 1,
        part_hash: tip,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: tip,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_precommit(&mut local, &common::SECRET_A).unwrap();
    server_node.note_precommit(&local).unwrap();
    let server = spawn_server_on(
        Arc::clone(&server_node),
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await
    .unwrap();

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let handle = run_operator(OperatorRequest {
        data: data.clone(),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![ConfiguredPeer {
            addr: server.listen_addr.clone(),
            peer_id: server.local_peer_id,
        }],
        once: true,
        txs: Vec::new(),
        seal_at: None,
        announce: None,
    })
    .await
    .unwrap();
    let bound = handle.listen.clone();
    drop(handle);
    assert!(bound.to_string().starts_with("/ip4/127.0.0.1/tcp/"));
    assert!(std::fs::read(&data).unwrap().starts_with(b"AKGCHNS9"));

    let again = arkhe_chain::ArkheNode::open(
        &data,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(again.committed_height().unwrap(), 1);
    assert_eq!(again.tip().unwrap(), tip);
    assert_eq!(again.balance("bob").unwrap(), 25);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(server_node.balance("bob").unwrap(), 25);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_sealed_block_is_synced_and_attested_by_the_named_peer() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-seal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let sealer = run_operator(OperatorRequest {
        data: dir.join("sealer"),
        id: "validator-a".into(),
        secret: common::SECRET_A,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: Vec::new(),
        once: false,
        txs: encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    .unwrap();
    let follower = run_operator(OperatorRequest {
        data: dir.join("follower"),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![ConfiguredPeer {
            addr: sealer.listen.clone(),
            peer_id: sealer.peer_id,
        }],
        once: true,
        txs: Vec::new(),
        seal_at: None,
        announce: None,
    })
    .await
    .unwrap();
    drop(follower);
    let tip = {
        let opened = arkhe_chain::ArkheNode::open(
            dir.join("sealer"),
            "validator-a",
            &common::SECRET_A,
            common::validators(),
            common::accounts(),
        )
        .unwrap();
        assert_eq!(opened.committed_height().unwrap(), 1);
        assert_eq!(opened.balance("bob").unwrap(), 25);
        assert_eq!(opened.height().unwrap(), 1);
        opened.tip().unwrap()
    };
    let followed = arkhe_chain::ArkheNode::open(
        dir.join("follower"),
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(followed.committed_height().unwrap(), 1);
    assert_eq!(followed.tip().unwrap(), tip);
    assert_eq!(followed.balance("bob").unwrap(), 25);
    assert!(std::fs::read(dir.join("follower"))
        .unwrap()
        .starts_with(b"AKGCHNS9"));
    drop(sealer);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_named_peer_submits_the_transaction_the_sealer_was_waiting_for() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-submit-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let sealer = run_operator(OperatorRequest {
        data: dir.join("sealer"),
        id: "validator-a".into(),
        secret: common::SECRET_A,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: Vec::new(),
        once: false,
        txs: Vec::new(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    .unwrap();
    let outsider = common::outsider();
    let good = common::transfer(0, GENESIS_ACCOUNT, "bob", 25);
    assert_eq!(
        submit_tx(&outsider, sealer.listen.clone(), sealer.peer_id, &good)
            .await
            .unwrap_err(),
        ChainError::P2p("peer")
    );
    let mut bad = good.clone();
    bad.signature_mldsa.clear();
    let sender = common::peer();
    assert_eq!(
        submit_tx(&sender, sealer.listen.clone(), sealer.peer_id, &bad)
            .await
            .unwrap_err(),
        ChainError::Malformed
    );
    let opened = arkhe_chain::ArkheNode::open(
        dir.join("sealer"),
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 0);
    assert_eq!(opened.mempool_len().unwrap(), 0);
    drop(opened);

    let follower = run_operator(OperatorRequest {
        data: dir.join("follower"),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![ConfiguredPeer {
            addr: sealer.listen.clone(),
            peer_id: sealer.peer_id,
        }],
        once: true,
        txs: encode_tx_list(&[good]).unwrap(),
        seal_at: None,
        announce: None,
    })
    .await
    .unwrap();
    drop(follower);
    let sealed = arkhe_chain::ArkheNode::open(
        dir.join("sealer"),
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    let followed = arkhe_chain::ArkheNode::open(
        dir.join("follower"),
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(sealed.height().unwrap(), 1);
    assert_eq!(sealed.committed_height().unwrap(), 1);
    assert_eq!(sealed.balance("bob").unwrap(), 25);
    assert_eq!(followed.height().unwrap(), 1);
    assert_eq!(followed.committed_height().unwrap(), 1);
    assert_eq!(followed.tip().unwrap(), sealed.tip().unwrap());
    assert_eq!(followed.balance("bob").unwrap(), 25);
    drop(sealer);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_second_submitted_transaction_seals_the_next_block() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-second-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let sealer = run_operator(OperatorRequest {
        data: dir.join("sealer"),
        id: "validator-a".into(),
        secret: common::SECRET_A,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: Vec::new(),
        once: false,
        txs: Vec::new(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    .unwrap();
    let follower = run_operator(OperatorRequest {
        data: dir.join("follower"),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![ConfiguredPeer {
            addr: sealer.listen.clone(),
            peer_id: sealer.peer_id,
        }],
        once: true,
        txs: encode_tx_list(&[
            common::transfer(0, GENESIS_ACCOUNT, "bob", 25),
            common::transfer(1, GENESIS_ACCOUNT, "bob", 1),
        ])
        .unwrap(),
        seal_at: None,
        announce: None,
    })
    .await
    .unwrap();
    drop(follower);
    let sealed = arkhe_chain::ArkheNode::open(
        dir.join("sealer"),
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    let followed = arkhe_chain::ArkheNode::open(
        dir.join("follower"),
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(sealed.height().unwrap(), 2);
    assert_eq!(sealed.committed_height().unwrap(), 2);
    assert_eq!(sealed.header_at(2).unwrap().timestamp, TS + 1);
    assert_eq!(sealed.balance("bob").unwrap(), 26);
    assert_eq!(followed.height().unwrap(), 2);
    assert_eq!(followed.committed_height().unwrap(), 2);
    assert_eq!(followed.tip().unwrap(), sealed.tip().unwrap());
    assert_eq!(followed.balance("bob").unwrap(), 26);
    drop(sealer);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_later_catch_up_imports_the_block_sealed_after_startup() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-catch-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let sealer = run_operator(OperatorRequest {
        data: dir.join("sealer"),
        id: "validator-a".into(),
        secret: common::SECRET_A,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: Vec::new(),
        once: false,
        txs: Vec::new(),
        seal_at: Some(TS),
        announce: None,
    })
    .await
    .unwrap();
    let follower = run_operator(OperatorRequest {
        data: dir.join("follower"),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: vec![ConfiguredPeer {
            addr: sealer.listen.clone(),
            peer_id: sealer.peer_id,
        }],
        once: false,
        txs: Vec::new(),
        seal_at: None,
        announce: None,
    })
    .await
    .unwrap();
    assert_eq!(follower.catch_up().await.unwrap(), 0);
    let sender = common::peer();
    submit_tx(
        &sender,
        sealer.listen.clone(),
        sealer.peer_id,
        &common::transfer(0, GENESIS_ACCOUNT, "bob", 25),
    )
    .await
    .unwrap();
    assert_eq!(follower.catch_up().await.unwrap(), 1);
    let sealed = arkhe_chain::ArkheNode::open(
        dir.join("sealer"),
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    let followed = arkhe_chain::ArkheNode::open(
        dir.join("follower"),
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(sealed.height().unwrap(), 1);
    assert_eq!(sealed.committed_height().unwrap(), 1);
    assert_eq!(followed.height().unwrap(), 1);
    assert_eq!(followed.committed_height().unwrap(), 1);
    assert_eq!(followed.tip().unwrap(), sealed.tip().unwrap());
    assert_eq!(followed.balance("bob").unwrap(), 25);
    drop(follower);
    drop(sealer);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_peer_file_dials_the_address_written_by_announce() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-peer-dial-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let announce = dir.join("listen");
    let sealer = run_operator(OperatorRequest {
        data: dir.join("sealer"),
        id: "validator-b".into(),
        secret: common::SECRET_B,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: Vec::new(),
        once: true,
        txs: Vec::new(),
        seal_at: None,
        announce: Some(announce.clone()),
    })
    .await
    .unwrap();
    let peers = read_peer_file(&announce).unwrap();
    assert_eq!(peers.peers.len(), 1);
    let expected = arkhe_chain::genesis_fingerprint(&operator_genesis())
        .unwrap()
        .hash;
    assert_eq!(peers.genesis, Some(expected));
    let mut hex_hash = String::with_capacity(64);
    for byte in expected {
        hex_hash.push_str(&format!("{byte:02x}"));
    }
    assert_eq!(
        format!("{}\n# genesis {hex_hash}\n", sealer.listen_line()),
        std::fs::read_to_string(&announce).unwrap()
    );
    let follower = run_operator(OperatorRequest {
        data: dir.join("follower"),
        id: "validator-a".into(),
        secret: common::SECRET_A,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: peers.peers,
        once: true,
        txs: Vec::new(),
        seal_at: None,
        announce: None,
    })
    .await
    .unwrap();
    assert_eq!(read_status(&dir.join("follower")).unwrap().height, 0);
    assert_eq!(read_status(&dir.join("sealer")).unwrap().height, 0);
    drop(follower);
    drop(sealer);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn the_process_status_counts_a_waiting_transaction() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-live-status-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let txs = encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap();
    let handle = run_operator(OperatorRequest {
        data: dir.join("chain"),
        id: "validator-a".into(),
        secret: common::SECRET_A,
        genesis: operator_genesis(),
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: Vec::new(),
        once: true,
        txs,
        seal_at: None,
        announce: None,
    })
    .await
    .unwrap();
    let status = handle.status().unwrap();
    assert_eq!(status.height, 0);
    assert_eq!(status.committed, 0);
    assert_eq!(status.mempool, 1);
    drop(handle);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_different_genesis_is_refused_before_import() {
    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let mut accounts = common::accounts();
    accounts.pop();
    let client = arkhe_chain::ArkheNode::new(
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        accounts,
    )
    .unwrap();
    assert_ne!(client.genesis_hash(), server_node.genesis_hash());
    let error = sync_canonical(&client, server.listen_addr.clone(), server.local_peer_id)
        .await
        .unwrap_err();
    assert_eq!(error, ChainError::P2p("genesis"));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
}

#[tokio::test]
async fn a_different_genesis_does_not_hide_a_peer_that_extends_the_local_tip() {
    let mut accounts = common::accounts();
    accounts.pop();
    let foreign_node = Arc::new(
        arkhe_chain::ArkheNode::new(
            "validator-a",
            &common::SECRET_A,
            common::validators(),
            accounts,
        )
        .unwrap(),
    );
    let foreign_server = spawn_server(Arc::clone(&foreign_node)).await.unwrap();
    let foreign = ConfiguredPeer {
        addr: foreign_server.listen_addr.clone(),
        peer_id: foreign_server.local_peer_id,
    };
    let client = common::peer();
    assert_ne!(client.genesis_hash(), foreign_node.genesis_hash());
    let alone = sync_configured(&client, &[foreign.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::P2p("genesis"));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let imported = sync_configured(&client, &[foreign.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(foreign_node.height().unwrap(), 0);

    let refused = attest_configured(&client, &common::SECRET_B, &[foreign.clone()])
        .await
        .unwrap_err();
    assert_eq!(refused, ChainError::P2p("genesis"));
    assert_eq!(client.committed_height().unwrap(), 0);
    assert_eq!(client.precommit_count(1).unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);

    let committed = attest_configured(&client, &common::SECRET_B, &[foreign, live])
        .await
        .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(foreign_node.height().unwrap(), 0);
}

#[tokio::test]
async fn a_different_genesis_refuses_a_transaction_and_a_vote() {
    let server_node = Arc::new(common::node());
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let mut accounts = common::accounts();
    accounts.pop();
    let client = arkhe_chain::ArkheNode::new(
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        accounts,
    )
    .unwrap();
    let error = submit_tx(
        &client,
        server.listen_addr.clone(),
        server.local_peer_id,
        &common::transfer(0, GENESIS_ACCOUNT, "bob", 25),
    )
    .await
    .unwrap_err();
    assert_eq!(error, ChainError::P2p("genesis"));
    assert_eq!(server_node.mempool_len().unwrap(), 0);
    assert_eq!(server_node.height().unwrap(), 0);

    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let mut vote = arkhe_chain::Precommit {
        validator_id: "validator-b".into(),
        height: 1,
        round: 0,
        parts: 1,
        part_hash: tip,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: tip,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_B).unwrap();
    let error = submit_precommit(
        &client,
        server.listen_addr.clone(),
        server.local_peer_id,
        &vote,
    )
    .await
    .unwrap_err();
    assert_eq!(error, ChainError::P2p("genesis"));
    assert_eq!(server_node.precommit_count(1).unwrap(), 0);
    assert_eq!(server_node.tip().unwrap(), tip);
}

fn operator_genesis() -> String {
    let mut text = String::new();
    for validator in common::validators() {
        text.push_str(&format!(
            "validator {} {}\n",
            validator.id,
            hex_key(&validator.public_key)
        ));
    }
    for account in common::accounts() {
        text.push_str(&format!(
            "account {} {}",
            account.id,
            hex_key(&account.public_key)
        ));
        if let Some(key) = account.mldsa_public_key {
            text.push(' ');
            text.push_str(&hex_key(&key));
        }
        text.push('\n');
    }
    text
}

fn hex_key(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[tokio::test]
async fn a_udp_listen_address_closes_without_waiting() {
    let started = std::time::Instant::now();
    let error = spawn_server_on(
        Arc::new(common::node()),
        "/ip4/127.0.0.1/udp/9".parse().unwrap(),
    )
    .await;
    assert!(matches!(error, Err(ChainError::P2p("listen-closed"))));
    assert!(started.elapsed() < std::time::Duration::from_secs(2));
}

#[tokio::test]
async fn an_unreadable_response_does_not_hide_a_peer_that_extends_the_local_tip() {
    let (bad_id, bad_addr, task) = listen_with_garbage().await;
    let bad = ConfiguredPeer {
        addr: bad_addr,
        peer_id: bad_id,
    };
    let client = common::peer();
    let started = std::time::Instant::now();
    let alone = sync_configured(&client, &[bad.clone()]).await.unwrap_err();
    assert_eq!(alone, ChainError::P2p("io"));
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let imported = sync_configured(&client, &[bad.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.fork_count().unwrap(), 0);

    let refused = attest_configured(&client, &common::SECRET_B, &[bad.clone()])
        .await
        .unwrap_err();
    assert_eq!(refused, ChainError::P2p("io"));
    assert_eq!(client.committed_height().unwrap(), 0);
    assert_eq!(client.precommit_count(1).unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);

    let committed = attest_configured(&client, &common::SECRET_B, &[bad, live])
        .await
        .unwrap();
    task.abort();
    assert_eq!(committed, 1);
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
}

#[tokio::test]
async fn an_unanswered_request_does_not_hide_a_peer_that_extends_the_local_tip() {
    let (stalled_id, stalled_addr, task) = listen_and_hold().await;
    let stalled = ConfiguredPeer {
        addr: stalled_addr,
        peer_id: stalled_id,
    };
    let client = common::peer();
    let started = std::time::Instant::now();
    let alone = sync_configured(&client, &[stalled.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::P2p("rr-timeout"));
    assert!(started.elapsed() >= std::time::Duration::from_secs(10));
    assert!(started.elapsed() < std::time::Duration::from_secs(20));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let started = std::time::Instant::now();
    let imported = sync_configured(&client, &[stalled.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert!(started.elapsed() >= std::time::Duration::from_secs(10));
    assert!(started.elapsed() < std::time::Duration::from_secs(20));
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.fork_count().unwrap(), 0);

    let started = std::time::Instant::now();
    let refused = attest_configured(&client, &common::SECRET_B, &[stalled.clone()])
        .await
        .unwrap_err();
    assert_eq!(refused, ChainError::P2p("rr-timeout"));
    assert!(started.elapsed() >= std::time::Duration::from_secs(10));
    assert!(started.elapsed() < std::time::Duration::from_secs(20));
    assert_eq!(client.committed_height().unwrap(), 0);
    assert_eq!(client.precommit_count(1).unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);

    let started = std::time::Instant::now();
    let committed = attest_configured(&client, &common::SECRET_B, &[stalled, live])
        .await
        .unwrap();
    task.abort();
    assert_eq!(committed, 1);
    assert!(started.elapsed() >= std::time::Duration::from_secs(10));
    assert!(started.elapsed() < std::time::Duration::from_secs(20));
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
}

#[tokio::test]
async fn a_closed_connection_does_not_hide_a_peer_that_extends_the_local_tip() {
    let (closed_id, closed_addr, task) = listen_and_drop().await;
    let closed = ConfiguredPeer {
        addr: closed_addr,
        peer_id: closed_id,
    };
    let client = common::peer();
    let started = std::time::Instant::now();
    let alone = sync_configured(&client, &[closed.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::P2p("connection-closed"));
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let started = std::time::Instant::now();
    let imported = sync_configured(&client, &[closed.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.fork_count().unwrap(), 0);

    let started = std::time::Instant::now();
    let refused = attest_configured(&client, &common::SECRET_B, &[closed.clone()])
        .await
        .unwrap_err();
    assert_eq!(refused, ChainError::P2p("connection-closed"));
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.committed_height().unwrap(), 0);
    assert_eq!(client.precommit_count(1).unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);

    let started = std::time::Instant::now();
    let committed = attest_configured(&client, &common::SECRET_B, &[closed, live])
        .await
        .unwrap();
    task.abort();
    assert_eq!(committed, 1);
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
}

#[tokio::test]
async fn a_refused_dial_does_not_hide_a_peer_that_extends_the_local_tip() {
    let client = common::peer();
    let dead = ConfiguredPeer {
        addr: "/ip4/127.0.0.1/tcp/9".parse().unwrap(),
        peer_id: common::node().peer_id(),
    };
    let started = std::time::Instant::now();
    let alone = sync_configured(&client, &[dead.clone()]).await.unwrap_err();
    assert_eq!(alone, ChainError::P2p("dial-failure"));
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let started = std::time::Instant::now();
    let imported = sync_configured(&client, &[dead.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.fork_count().unwrap(), 0);

    let started = std::time::Instant::now();
    let refused = attest_configured(&client, &common::SECRET_B, &[dead.clone()])
        .await
        .unwrap_err();
    assert_eq!(refused, ChainError::P2p("dial-failure"));
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.committed_height().unwrap(), 0);
    assert_eq!(client.precommit_count(1).unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);

    let started = std::time::Instant::now();
    let committed = attest_configured(&client, &common::SECRET_B, &[dead, live])
        .await
        .unwrap();
    assert_eq!(committed, 1);
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
}

#[tokio::test]
async fn an_outsider_does_not_hide_a_peer_that_extends_the_local_tip() {
    let outsider = ConfiguredPeer {
        addr: "/ip4/127.0.0.1/tcp/9".parse().unwrap(),
        peer_id: common::outsider().peer_id(),
    };
    let client = common::peer();
    let alone = sync_configured(&client, &[outsider.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::P2p("peer"));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let imported = sync_configured(&client, &[outsider.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.fork_count().unwrap(), 0);

    let refused = attest_configured(&client, &common::SECRET_B, &[outsider.clone()])
        .await
        .unwrap_err();
    assert_eq!(refused, ChainError::P2p("peer"));
    assert_eq!(client.committed_height().unwrap(), 0);
    assert_eq!(client.precommit_count(1).unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);

    let committed = attest_configured(&client, &common::SECRET_B, &[outsider, live])
        .await
        .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
}

#[tokio::test]
async fn configured_peers_skip_self_and_stop_on_an_outsider() {
    let client = common::peer();
    let error = sync_configured(&client, &[]).await.unwrap_err();
    assert_eq!(error, ChainError::P2p("empty"));

    let error = sync_configured(
        &client,
        &[ConfiguredPeer {
            addr: "/ip4/127.0.0.1/tcp/9".parse().unwrap(),
            peer_id: common::outsider().peer_id(),
        }],
    )
    .await
    .unwrap_err();
    assert_eq!(error, ChainError::P2p("peer"));
    assert_eq!(client.height().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 4))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let imported = sync_configured(
        &client,
        &[
            ConfiguredPeer {
                addr: "/ip4/127.0.0.1/tcp/9".parse().unwrap(),
                peer_id: client.peer_id(),
            },
            ConfiguredPeer {
                addr: server.listen_addr.clone(),
                peer_id: server.local_peer_id,
            },
        ],
    )
    .await
    .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.balance("bob").unwrap(), 4);
}

#[tokio::test]
async fn a_validator_without_the_sync_protocol_is_refused() {
    let (peer_id, addr, task) = listen_without_sync().await;
    assert_eq!(peer_id, common::node().peer_id());
    let client = common::peer();
    let started = std::time::Instant::now();
    let error = sync_canonical(&client, addr, peer_id).await.unwrap_err();
    task.abort();
    assert_eq!(error, ChainError::P2p("unsupported-protocol"));
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
}

#[tokio::test]
async fn a_peer_without_the_protocol_does_not_hide_a_peer_that_extends_the_local_tip() {
    let (silent_id, silent_addr, task) = listen_without_sync().await;
    let silent = ConfiguredPeer {
        addr: silent_addr,
        peer_id: silent_id,
    };
    let client = common::peer();
    let alone = sync_configured(&client, &[silent.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::P2p("unsupported-protocol"));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let imported = sync_configured(&client, &[silent.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.fork_count().unwrap(), 0);

    let refused = attest_configured(&client, &common::SECRET_B, &[silent.clone()])
        .await
        .unwrap_err();
    assert_eq!(refused, ChainError::P2p("unsupported-protocol"));
    assert_eq!(client.committed_height().unwrap(), 0);
    assert_eq!(client.precommit_count(1).unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);

    let committed = attest_configured(&client, &common::SECRET_B, &[silent, live])
        .await
        .unwrap();
    task.abort();
    assert_eq!(committed, 1);
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
}

async fn listen_without_sync() -> (
    libp2p::PeerId,
    libp2p::Multiaddr,
    tokio::task::JoinHandle<()>,
) {
    let keypair = validator_a_key();
    let peer_id = keypair.public().to_peer_id();
    let mut swarm = libp2p::SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_tcp(
            libp2p::tcp::Config::default(),
            libp2p::noise::Config::new,
            libp2p::yamux::Config::default,
        )
        .unwrap()
        .with_behaviour(|_| libp2p::swarm::dummy::Behaviour)
        .map_err(|err| match err {})
        .unwrap()
        .with_swarm_config(|config| {
            config.with_idle_connection_timeout(std::time::Duration::from_secs(10))
        })
        .build();
    swarm
        .listen_on("/ip4/127.0.0.1/tcp/0".parse().unwrap())
        .unwrap();
    let addr = loop {
        if let libp2p::swarm::SwarmEvent::NewListenAddr { address, .. } =
            swarm.select_next_some().await
        {
            break address;
        }
    };
    let task = tokio::spawn(async move {
        loop {
            swarm.select_next_some().await;
        }
    });
    (peer_id, addr, task)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VoteRequest {
    validator_id: String,
    height: u64,
    round: u64,
    block_hash: [u8; 32],
    parts: u32,
    part_hash: [u8; 32],
    chain_id: String,
    signature: Vec<u8>,
    genesis: [u8; 32],
    #[serde(default)]
    block: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VoteReply {
    stored: bool,
    reason: Option<String>,
    committed: u64,
    echo: Option<VoteRequest>,
}

#[derive(libp2p::swarm::NetworkBehaviour)]
struct DropBehaviour {
    sync: request_response::cbor::Behaviour<SyncRequest, SyncResponse>,
    vote: request_response::cbor::Behaviour<VoteRequest, VoteReply>,
}

async fn listen_and_drop() -> (PeerId, Multiaddr, tokio::task::JoinHandle<()>) {
    let keypair = validator_a_key();
    let peer_id = keypair.public().to_peer_id();
    let mut swarm = SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )
        .unwrap()
        .with_behaviour(|_| DropBehaviour {
            sync: request_response::cbor::Behaviour::new(
                [(
                    StreamProtocol::new("/arkhe/block-sync/1"),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            ),
            vote: request_response::cbor::Behaviour::new(
                [(
                    StreamProtocol::new("/arkhe/precommit/1"),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            ),
        })
        .map_err(|err| match err {})
        .unwrap()
        .with_swarm_config(|config| {
            config.with_idle_connection_timeout(std::time::Duration::from_secs(10))
        })
        .build();
    swarm
        .listen_on("/ip4/127.0.0.1/tcp/0".parse().unwrap())
        .unwrap();
    let addr = loop {
        if let libp2p::swarm::SwarmEvent::NewListenAddr { address, .. } =
            swarm.select_next_some().await
        {
            break address;
        }
    };
    let task = tokio::spawn(async move {
        loop {
            match swarm.select_next_some().await {
                libp2p::swarm::SwarmEvent::Behaviour(DropBehaviourEvent::Sync(
                    request_response::Event::Message {
                        peer,
                        message: request_response::Message::Request { .. },
                        ..
                    },
                ))
                | libp2p::swarm::SwarmEvent::Behaviour(DropBehaviourEvent::Vote(
                    request_response::Event::Message {
                        peer,
                        message: request_response::Message::Request { .. },
                        ..
                    },
                )) => {
                    let _ = swarm.disconnect_peer_id(peer);
                }
                _ => {}
            }
        }
    });
    (peer_id, addr, task)
}

#[derive(libp2p::swarm::NetworkBehaviour)]
struct GenesisVoteBehaviour {
    sync: request_response::cbor::Behaviour<SyncRequest, SyncResponse>,
    vote: request_response::cbor::Behaviour<VoteRequest, VoteReply>,
}

async fn listen_sync_tip_vote_reason(
    genesis: [u8; 32],
    reason: &'static str,
) -> (PeerId, Multiaddr, tokio::task::JoinHandle<()>) {
    let keypair = validator_a_key();
    let peer_id = keypair.public().to_peer_id();
    let mut swarm = SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )
        .unwrap()
        .with_behaviour(|_| GenesisVoteBehaviour {
            sync: request_response::cbor::Behaviour::new(
                [(
                    StreamProtocol::new("/arkhe/block-sync/1"),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            ),
            vote: request_response::cbor::Behaviour::new(
                [(
                    StreamProtocol::new("/arkhe/precommit/1"),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            ),
        })
        .map_err(|err| match err {})
        .unwrap()
        .with_swarm_config(|config| {
            config.with_idle_connection_timeout(std::time::Duration::from_secs(60))
        })
        .build();
    swarm
        .listen_on("/ip4/127.0.0.1/tcp/0".parse().unwrap())
        .unwrap();
    let addr = loop {
        if let libp2p::swarm::SwarmEvent::NewListenAddr { address, .. } =
            swarm.select_next_some().await
        {
            break address;
        }
    };
    let task = tokio::spawn(async move {
        loop {
            match swarm.select_next_some().await {
                libp2p::swarm::SwarmEvent::Behaviour(GenesisVoteBehaviourEvent::Sync(
                    request_response::Event::Message {
                        message:
                            request_response::Message::Request {
                                request, channel, ..
                            },
                        ..
                    },
                )) => {
                    let response = match request {
                        SyncRequest::Tip => SyncResponse {
                            body: Some(vec![0; 32]),
                            genesis: Some(genesis),
                        },
                        SyncRequest::Block { .. } | SyncRequest::Child { .. } => SyncResponse {
                            body: None,
                            genesis: Some(genesis),
                        },
                    };
                    let _ = swarm.behaviour_mut().sync.send_response(channel, response);
                }
                libp2p::swarm::SwarmEvent::Behaviour(GenesisVoteBehaviourEvent::Vote(
                    request_response::Event::Message {
                        message: request_response::Message::Request { channel, .. },
                        ..
                    },
                )) => {
                    let _ = swarm.behaviour_mut().vote.send_response(
                        channel,
                        VoteReply {
                            stored: false,
                            reason: Some(reason.into()),
                            committed: 0,
                            echo: None,
                        },
                    );
                }
                _ => {}
            }
        }
    });
    (peer_id, addr, task)
}

async fn listen_and_hold() -> (PeerId, Multiaddr, tokio::task::JoinHandle<()>) {
    let keypair = validator_a_key();
    let peer_id = keypair.public().to_peer_id();
    let mut swarm = SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )
        .unwrap()
        .with_behaviour(|_| DropBehaviour {
            sync: request_response::cbor::Behaviour::new(
                [(
                    StreamProtocol::new("/arkhe/block-sync/1"),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            ),
            vote: request_response::cbor::Behaviour::new(
                [(
                    StreamProtocol::new("/arkhe/precommit/1"),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            ),
        })
        .map_err(|err| match err {})
        .unwrap()
        .with_swarm_config(|config| {
            config.with_idle_connection_timeout(std::time::Duration::from_secs(60))
        })
        .build();
    swarm
        .listen_on("/ip4/127.0.0.1/tcp/0".parse().unwrap())
        .unwrap();
    let addr = loop {
        if let libp2p::swarm::SwarmEvent::NewListenAddr { address, .. } =
            swarm.select_next_some().await
        {
            break address;
        }
    };
    let task = tokio::spawn(async move {
        let mut sync_channels = Vec::new();
        let mut vote_channels = Vec::new();
        loop {
            match swarm.select_next_some().await {
                libp2p::swarm::SwarmEvent::Behaviour(DropBehaviourEvent::Sync(
                    request_response::Event::Message {
                        message: request_response::Message::Request { channel, .. },
                        ..
                    },
                )) => sync_channels.push(channel),
                libp2p::swarm::SwarmEvent::Behaviour(DropBehaviourEvent::Vote(
                    request_response::Event::Message {
                        message: request_response::Message::Request { channel, .. },
                        ..
                    },
                )) => vote_channels.push(channel),
                _ => {}
            }
        }
    });
    (peer_id, addr, task)
}

#[derive(Clone, Default)]
struct GarbageCodec;

#[async_trait::async_trait]
impl libp2p::request_response::Codec for GarbageCodec {
    type Protocol = StreamProtocol;
    type Request = Vec<u8>;
    type Response = Vec<u8>;

    async fn read_request<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
    ) -> std::io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        let mut buf = Vec::new();
        io.read_to_end(&mut buf).await?;
        Ok(buf)
    }

    async fn read_response<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
    ) -> std::io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        let mut buf = Vec::new();
        io.read_to_end(&mut buf).await?;
        Ok(buf)
    }

    async fn write_request<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
        request: Self::Request,
    ) -> std::io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        io.write_all(&request).await
    }

    async fn write_response<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
        _: Self::Response,
    ) -> std::io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        io.write_all(&[0xff]).await
    }
}

#[derive(libp2p::swarm::NetworkBehaviour)]
struct GarbageBehaviour {
    sync: request_response::Behaviour<GarbageCodec>,
    vote: request_response::Behaviour<GarbageCodec>,
}

async fn listen_with_garbage() -> (PeerId, Multiaddr, tokio::task::JoinHandle<()>) {
    let keypair = validator_a_key();
    let peer_id = keypair.public().to_peer_id();
    let mut swarm = SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )
        .unwrap()
        .with_behaviour(|_| GarbageBehaviour {
            sync: request_response::Behaviour::new(
                [(
                    StreamProtocol::new("/arkhe/block-sync/1"),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            ),
            vote: request_response::Behaviour::new(
                [(
                    StreamProtocol::new("/arkhe/precommit/1"),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            ),
        })
        .map_err(|err| match err {})
        .unwrap()
        .with_swarm_config(|config| {
            config.with_idle_connection_timeout(std::time::Duration::from_secs(60))
        })
        .build();
    swarm
        .listen_on("/ip4/127.0.0.1/tcp/0".parse().unwrap())
        .unwrap();
    let addr = loop {
        if let libp2p::swarm::SwarmEvent::NewListenAddr { address, .. } =
            swarm.select_next_some().await
        {
            break address;
        }
    };
    let task = tokio::spawn(async move {
        loop {
            match swarm.select_next_some().await {
                libp2p::swarm::SwarmEvent::Behaviour(GarbageBehaviourEvent::Sync(
                    request_response::Event::Message {
                        message: request_response::Message::Request { channel, .. },
                        ..
                    },
                )) => {
                    let _ = swarm
                        .behaviour_mut()
                        .sync
                        .send_response(channel, Vec::new());
                }
                libp2p::swarm::SwarmEvent::Behaviour(GarbageBehaviourEvent::Vote(
                    request_response::Event::Message {
                        message: request_response::Message::Request { channel, .. },
                        ..
                    },
                )) => {
                    let _ = swarm
                        .behaviour_mut()
                        .vote
                        .send_response(channel, Vec::new());
                }
                _ => {}
            }
        }
    });
    (peer_id, addr, task)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum SyncRequest {
    Tip,
    Block { hash: [u8; 32] },
    Child { parent: [u8; 32] },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncResponse {
    body: Option<Vec<u8>>,
    genesis: Option<[u8; 32]>,
}

#[tokio::test]
async fn a_short_announced_tip_is_refused() {
    let (peer_id, addr, task) = listen_with_replies(Some(vec![1, 2, 3]), None).await;
    let client = common::peer();
    let started = std::time::Instant::now();
    let error = sync_canonical(&client, addr, peer_id).await.unwrap_err();
    task.abort();
    assert_eq!(error, ChainError::P2p("tip"));
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
}

#[tokio::test]
async fn a_short_announced_tip_does_not_hide_a_peer_that_extends_the_local_tip() {
    let (short_id, short_addr, task) = listen_with_replies(Some(vec![1, 2, 3]), None).await;
    let short = ConfiguredPeer {
        addr: short_addr,
        peer_id: short_id,
    };
    let client = common::peer();
    let alone = sync_configured(&client, &[short.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::P2p("tip"));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let imported = sync_configured(&client, &[short.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.fork_count().unwrap(), 0);

    let committed = attest_configured(&client, &common::SECRET_B, &[short, live])
        .await
        .unwrap();
    task.abort();
    assert_eq!(committed, 1);
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
}

#[tokio::test]
async fn a_body_that_does_not_match_its_hash_is_refused() {
    let (peer_id, addr, task) =
        listen_with_replies(Some(vec![0x44; 32]), Some(b"nope".to_vec())).await;
    let client = common::peer();
    let started = std::time::Instant::now();
    let error = sync_canonical(&client, addr, peer_id).await.unwrap_err();
    task.abort();
    assert_eq!(error, ChainError::P2p("hash"));
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
}

#[tokio::test]
async fn a_bad_body_hash_does_not_hide_a_peer_that_extends_the_local_tip() {
    let (liar_id, liar_addr, task) =
        listen_with_replies(Some(vec![0x44; 32]), Some(b"nope".to_vec())).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let client = common::peer();
    let alone = sync_configured(&client, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone, ChainError::P2p("hash"));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let imported = sync_configured(&client, &[liar.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.fork_count().unwrap(), 0);

    let committed = attest_configured(&client, &common::SECRET_B, &[liar, live])
        .await
        .unwrap();
    task.abort();
    assert_eq!(committed, 1);
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
}

#[tokio::test]
async fn a_malformed_body_does_not_hide_a_peer_that_extends_the_local_tip() {
    let body = b"nope".to_vec();
    let hash = arkhe_chain::block_hash(&body);
    let (liar_id, liar_addr, task) = listen_with_replies(Some(hash.to_vec()), Some(body)).await;
    let liar = ConfiguredPeer {
        addr: liar_addr,
        peer_id: liar_id,
    };
    let client = common::peer();
    let alone = sync_configured(&client, &[liar.clone()]).await.unwrap_err();
    assert_eq!(alone, ChainError::Malformed);
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let imported = sync_configured(&client, &[liar.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.fork_count().unwrap(), 0);

    let committed = attest_configured(&client, &common::SECRET_B, &[liar, live])
        .await
        .unwrap();
    task.abort();
    assert_eq!(committed, 1);
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
}

#[tokio::test]
async fn a_missing_body_does_not_hide_a_peer_that_extends_the_local_tip() {
    let secret_c = [0x33u8; 32];
    let validators = vec![
        arkhe_chain::Validator {
            id: "validator-a".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_A).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-b".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_B).unwrap(),
        },
        arkhe_chain::Validator {
            id: "validator-c".into(),
            public_key: arkhe_chain::public_key(&secret_c).unwrap(),
        },
    ];
    let accounts = common::accounts();
    let client = arkhe_chain::ArkheNode::new(
        "validator-b",
        &common::SECRET_B,
        validators.clone(),
        accounts.clone(),
    )
    .unwrap();
    let server_node = Arc::new(
        arkhe_chain::ArkheNode::new("validator-a", &common::SECRET_A, validators, accounts)
            .unwrap(),
    );
    let mut raw = secret_c;
    let secret = identity::ed25519::SecretKey::try_from_bytes(&mut raw).unwrap();
    let key = identity::Keypair::from(identity::ed25519::Keypair::from(secret));
    let (missing_id, missing_addr, task) = listen_replies(
        key,
        client.genesis_hash(),
        Some(vec![0xab; 32]),
        None,
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await;
    let missing = ConfiguredPeer {
        addr: missing_addr,
        peer_id: missing_id,
    };
    let alone = sync_configured(&client, &[missing.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::P2p("fork"));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.fork_count().unwrap(), 0);
    assert_eq!(client.tip().unwrap(), [0; 32]);

    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let longer = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let imported = sync_configured(&client, &[missing.clone(), longer.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), server_node.tip().unwrap());
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.fork_count().unwrap(), 0);

    let again = sync_configured(&client, &[longer, missing]).await.unwrap();
    task.abort();
    assert_eq!(again, 0);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), server_node.tip().unwrap());
}

fn validator_a_key() -> identity::Keypair {
    let mut raw = common::SECRET_A;
    let secret = identity::ed25519::SecretKey::try_from_bytes(&mut raw).unwrap();
    identity::Keypair::from(identity::ed25519::Keypair::from(secret))
}

async fn listen_with_replies(
    tip: Option<Vec<u8>>,
    block: Option<Vec<u8>>,
) -> (PeerId, Multiaddr, tokio::task::JoinHandle<()>) {
    listen_replies(
        validator_a_key(),
        common::peer().genesis_hash(),
        tip,
        block,
        "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
    .await
}

async fn listen_replies(
    keypair: identity::Keypair,
    genesis: [u8; 32],
    tip: Option<Vec<u8>>,
    block: Option<Vec<u8>>,
    bind: Multiaddr,
) -> (PeerId, Multiaddr, tokio::task::JoinHandle<()>) {
    let peer_id = keypair.public().to_peer_id();
    let mut swarm = SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )
        .unwrap()
        .with_behaviour(|_| {
            request_response::cbor::Behaviour::<SyncRequest, SyncResponse>::new(
                [(
                    StreamProtocol::new("/arkhe/block-sync/1"),
                    request_response::ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            )
        })
        .map_err(|err| match err {})
        .unwrap()
        .with_swarm_config(|config| {
            config.with_idle_connection_timeout(std::time::Duration::from_secs(10))
        })
        .build();
    swarm.listen_on(bind).unwrap();
    let addr = loop {
        if let libp2p::swarm::SwarmEvent::NewListenAddr { address, .. } =
            swarm.select_next_some().await
        {
            break address;
        }
    };
    let genesis = Some(genesis);
    let task = tokio::spawn(async move {
        loop {
            if let libp2p::swarm::SwarmEvent::Behaviour(request_response::Event::Message {
                message:
                    request_response::Message::Request {
                        request, channel, ..
                    },
                ..
            }) = swarm.select_next_some().await
            {
                let response = match request {
                    SyncRequest::Tip => SyncResponse {
                        body: tip.clone(),
                        genesis,
                    },
                    SyncRequest::Block { .. } => SyncResponse {
                        body: block.clone(),
                        genesis,
                    },
                    SyncRequest::Child { .. } => SyncResponse {
                        body: None,
                        genesis,
                    },
                };
                let _ = swarm.behaviour_mut().send_response(channel, response);
            }
        }
    });
    (peer_id, addr, task)
}
