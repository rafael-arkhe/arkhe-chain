mod common;

use arkhe_chain::{ChainError, Transaction, GENESIS_ACCOUNT, GENESIS_SUPPLY};

const TS: u64 = 1_700_000_000;
const FLOOD: u64 = 1_000;

#[test]
fn invalid_flood_stays_out_of_the_mempool() {
    let node = common::node();
    let valid = common::transfer(0, GENESIS_ACCOUNT, "bob", 500);
    node.ingest(valid.clone()).unwrap();

    for nonce in 0..FLOOD {
        let malformed = Transaction {
            nonce,
            sender: "attacker-node".into(),
            recipient: "target-node".into(),
            value: 999_999,
            payload: b"FORCE_REJECT".to_vec(),
            signature_mldsa: vec![0xFF; 64],
            sender_signature: [0u8; 64],
        };
        assert_eq!(
            node.ingest(malformed).unwrap_err(),
            ChainError::BadSignatureLength
        );
        assert_eq!(
            node.ingest(common::rejected_transfer(
                nonce,
                "attacker-node",
                "target-node",
                1
            ))
            .unwrap_err(),
            ChainError::Admission("not-allow")
        );
        assert_eq!(
            node.ingest(valid.clone()).unwrap_err(),
            ChainError::BadNonce
        );
    }

    let mismatched = common::mismatched_subject(&common::transfer(1, GENESIS_ACCOUNT, "bob", 1));
    assert_eq!(
        node.ingest(mismatched).unwrap_err(),
        ChainError::Admission("subject")
    );
    assert_eq!(
        node.ingest(common::transfer(
            0,
            "attacker-node",
            "target-node",
            GENESIS_SUPPLY
        ))
        .unwrap_err(),
        ChainError::InsufficientBalance
    );

    assert_eq!(node.mempool_len().unwrap(), 1);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.height().unwrap(), 0);
    assert_eq!(node.mmr_count().unwrap(), 0);

    node.ingest(common::transfer(1, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    assert_eq!(node.mempool_len().unwrap(), 2);
    let block = node.propose_and_seal_block(TS).unwrap().block.unwrap();
    assert_eq!(block.transactions.len(), 2);
    assert_eq!(node.balance("bob").unwrap(), 500);
    assert_eq!(node.balance("carol").unwrap(), 10);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY - 510);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.height().unwrap(), 1);
    assert_eq!(node.mmr_count().unwrap(), 2);
    assert_eq!(node.mempool_len().unwrap(), 0);
}

#[test]
fn the_mempool_stops_at_one_thousand_and_a_block_seals_two_hundred_fifty() {
    let mut prepared = Vec::with_capacity(1_001);
    for index in 0..1_001 {
        prepared.push(common::fresh_zero_transfer(index));
    }
    let mut accounts = common::accounts();
    accounts.extend(prepared.iter().map(|(account, _)| account.clone()));
    let node = arkhe_chain::ArkheNode::new(
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        accounts,
    )
    .unwrap();
    for (_, tx) in prepared.iter().take(1_000) {
        node.ingest(tx.clone()).unwrap();
    }
    assert_eq!(node.mempool_len().unwrap(), 1_000);
    assert_eq!(node.height().unwrap(), 0);
    assert_eq!(node.ingest(prepared[1_000].1.clone()).unwrap_err(), ChainError::MempoolFull);
    assert_eq!(node.mempool_len().unwrap(), 1_000);

    let block = node.propose_and_seal_block(TS).unwrap().block.unwrap();
    assert_eq!(block.transactions.len(), 250);
    assert_eq!(node.mempool_len().unwrap(), 750);
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.height().unwrap(), 1);
    assert_eq!(node.mmr_count().unwrap(), 250);
}
