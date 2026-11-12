from pathlib import Path

path = Path(r"D:\arkhe\kernel\arkhe-chain\tests\block_sync.rs")
text = path.read_text(encoding="utf-8")
needle = """    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(client.tip().unwrap(), tip);
}

#[tokio::test]
async fn the_operator_attests_the_synced_height_without_changing_the_tip() {
"""
insert = """    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(client.tip().unwrap(), tip);
}

#[tokio::test]
async fn a_third_validator_records_the_vote_it_did_not_hear_directly() {
    let secret_c = [0x33u8; 32];
    let validators = vec![
        arkhe_chain::Validator {
            id: \"validator-a\".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_A).unwrap(),
        },
        arkhe_chain::Validator {
            id: \"validator-b\".into(),
            public_key: arkhe_chain::public_key(&common::SECRET_B).unwrap(),
        },
        arkhe_chain::Validator {
            id: \"validator-c\".into(),
            public_key: arkhe_chain::public_key(&secret_c).unwrap(),
        },
    ];
    let accounts = common::accounts();
    let sealer = arkhe_chain::ArkheNode::new(
        \"validator-a\",
        &common::SECRET_A,
        validators.clone(),
        accounts.clone(),
    )
    .unwrap();
    let bob = Arc::new(
        arkhe_chain::ArkheNode::new(
            \"validator-b\",
            &common::SECRET_B,
            validators.clone(),
            accounts.clone(),
        )
        .unwrap(),
    );
    let carol = Arc::new(
        arkhe_chain::ArkheNode::new(\"validator-c\", &secret_c, validators, accounts).unwrap(),
    );
    sealer
        .ingest(common::transfer(0, GENESIS_ACCOUNT, \"bob\", 25))
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
    assert_eq!(bob.precommit_round(1, \"validator-c\").unwrap(), Some(0));
    assert_eq!(carol.precommit_round(1, \"validator-b\").unwrap(), Some(0));
}

#[tokio::test]
async fn the_operator_attests_the_synced_height_without_changing_the_tip() {
"""
count = text.count(needle)
if count != 1:
    raise SystemExit(f"needle count {count}")
out = Path(r"D:\arkhe\tmp\block_sync.rs.new")
out.write_bytes(text.replace(needle, insert, 1).encode("utf-8"))
print(out, out.stat().st_size)
