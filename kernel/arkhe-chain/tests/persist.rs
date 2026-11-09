mod common;

use arkhe_chain::{ArkheNode, ChainError, GENESIS_ACCOUNT, GENESIS_SUPPLY};

const TS: u64 = 1_700_000_000;

fn path(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "arkhe-chain-{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ))
}

fn validators() -> Vec<arkhe_chain::Validator> {
    common::validators()
}

#[test]
fn a_reopened_file_replays_the_same_tip_balances_and_mmr() {
    let path = path("reopen");
    let node = ArkheNode::open(&path, "validator-a", &common::SECRET_A, validators(), common::accounts()).unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    node.ingest(common::transfer(1, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    node.propose_and_seal_block(TS + 1).unwrap();
    let tip = node.tip().unwrap();
    let root = node.mmr_root().unwrap();
    drop(node);

    let again = ArkheNode::open(&path, "validator-a", &common::SECRET_A, validators(), common::accounts()).unwrap();
    assert_eq!(again.height().unwrap(), 2);
    assert_eq!(again.tip().unwrap(), tip);
    assert_eq!(again.mmr_root().unwrap(), root);
    assert_eq!(again.mmr_count().unwrap(), 2);
    assert_eq!(again.balance("bob").unwrap(), 25);
    assert_eq!(again.balance("carol").unwrap(), 10);
    assert_eq!(again.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY - 35);
    assert_eq!(again.supply().unwrap(), GENESIS_SUPPLY);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn a_tampered_snapshot_does_not_open() {
    let path = path("tamper");
    let node = ArkheNode::open(&path, "validator-a", &common::SECRET_A, validators(), common::accounts()).unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    drop(node);

    let mut bytes = std::fs::read(&path).unwrap();
    bytes.pop();
    std::fs::write(&path, bytes).unwrap();
    match ArkheNode::open(&path, "validator-a", &common::SECRET_A, validators(), common::accounts()) {
        Ok(_) => panic!("truncated snapshot opened"),
        Err(error) => assert_eq!(error, ChainError::Snapshot),
    }
    let _ = std::fs::remove_file(&path);
}

#[test]
fn a_failed_checkpoint_keeps_the_tip_the_balance_and_the_mempool() {
    let path = path("failwrite");
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    let before = std::fs::read(&path).unwrap();
    let tmp = path.with_extension("arkhe-tmp");
    std::fs::create_dir(&tmp).unwrap();
    assert_eq!(
        node.propose_and_seal_block(TS).unwrap_err(),
        ChainError::Snapshot
    );
    assert_eq!(node.height().unwrap(), 0);
    assert_eq!(node.tip().unwrap(), [0u8; 32]);
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.mempool_len().unwrap(), 1);
    assert_eq!(std::fs::read(&path).unwrap(), before);
    drop(node);

    std::fs::remove_dir(&tmp).unwrap();
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(node.mempool_len().unwrap(), 1);
    node.propose_and_seal_block(TS).unwrap();
    assert_eq!(node.height().unwrap(), 1);
    assert_eq!(node.balance("bob").unwrap(), 25);
    drop(node);

    let again = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(again.height().unwrap(), 1);
    assert_eq!(again.balance("bob").unwrap(), 25);
    assert_eq!(again.mempool_len().unwrap(), 0);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn a_reopened_file_keeps_the_unsealed_mempool() {
    let path = path("queue");
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.ingest(common::transfer(1, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    drop(node);

    let again = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(again.height().unwrap(), 0);
    assert_eq!(again.balance("bob").unwrap(), 0);
    assert_eq!(again.balance("carol").unwrap(), 0);
    assert_eq!(again.mempool_len().unwrap(), 2);
    again.propose_and_seal_block(TS).unwrap();
    assert_eq!(again.balance("bob").unwrap(), 25);
    assert_eq!(again.balance("carol").unwrap(), 10);
    assert_eq!(again.mempool_len().unwrap(), 0);
    assert_eq!(
        again.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 35
    );
    drop(again);

    let sealed = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(sealed.height().unwrap(), 1);
    assert_eq!(sealed.mempool_len().unwrap(), 0);
    assert_eq!(sealed.balance("bob").unwrap(), 25);
    assert_eq!(sealed.balance("carol").unwrap(), 10);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn an_older_snapshot_without_the_mempool_does_not_open() {
    let path = path("oldmagic");
    for magic in [
        b"AKGCHNS1".as_slice(),
        b"AKGCHNS2".as_slice(),
        b"AKGCHNS3".as_slice(),
        b"AKGCHNS4".as_slice(),
    ] {
        std::fs::write(&path, magic).unwrap();
        match ArkheNode::open(
            &path,
            "validator-a",
            &common::SECRET_A,
            validators(),
            common::accounts(),
        ) {
            Ok(_) => panic!("snapshot without the account keys opened"),
            Err(error) => assert_eq!(error, ChainError::Snapshot),
        }
    }
    let _ = std::fs::remove_file(&path);
}

#[test]
fn a_reopened_file_keeps_a_fork_and_the_first_tip() {
    let path = path("fork");
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();
    let other = common::peer();
    other
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    let rival = other.propose_and_seal_block(TS).unwrap().block.unwrap();
    let encoded = arkhe_chain::encode_block(&rival);
    assert_eq!(
        node.import_block(&encoded).unwrap_err(),
        ChainError::Fork
    );
    assert_eq!(node.fork_count().unwrap(), 1);
    assert_eq!(node.tip().unwrap(), tip);
    drop(node);

    let again = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(again.fork_count().unwrap(), 1);
    assert_eq!(again.height().unwrap(), 1);
    assert_eq!(again.tip().unwrap(), tip);
    assert_eq!(again.balance("bob").unwrap(), 25);
    assert_eq!(again.balance("carol").unwrap(), 0);
    assert_eq!(
        again.import_block(&encoded).unwrap_err(),
        ChainError::Fork
    );
    assert_eq!(again.fork_count().unwrap(), 1);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn a_reopened_file_keeps_the_precommits_and_the_weight_threshold() {
    let path = path("precommit");
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();
    for (id, secret) in [
        ("validator-a", common::SECRET_A),
        ("validator-b", common::SECRET_B),
    ] {
        let mut vote = arkhe_chain::Precommit {
            validator_id: id.into(),
            height: 1,
            round: 0,
            block_hash: tip,
            signature: [0u8; 64],
        };
        arkhe_chain::sign_precommit(&mut vote, &secret).unwrap();
        node.note_precommit(&vote).unwrap();
    }
    assert_eq!(node.precommit_count(1).unwrap(), 2);
    drop(node);

    let again = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(again.precommit_count(1).unwrap(), 2);
    assert_eq!(again.precommit_round(1, "validator-a").unwrap(), Some(0));
    assert_eq!(again.precommit_round(1, "validator-b").unwrap(), Some(0));
    again.bft_commit(1).unwrap();
    assert_eq!(again.height().unwrap(), 1);
    assert_eq!(again.tip().unwrap(), tip);
    assert_eq!(again.balance("bob").unwrap(), 25);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn a_precommit_with_a_bad_signature_does_not_open() {
    let path = path("precommit-bad");
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();
    let mut vote = arkhe_chain::Precommit {
        validator_id: "validator-a".into(),
        height: 1,
        round: 0,
        block_hash: tip,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_A).unwrap();
    node.note_precommit(&vote).unwrap();
    drop(node);

    let mut bytes = std::fs::read(&path).unwrap();
    let last = bytes.len() - 1;
    bytes[last] ^= 0x01;
    std::fs::write(&path, &bytes).unwrap();
    match ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    ) {
        Ok(_) => panic!("tampered precommit opened"),
        Err(error) => assert_eq!(error, ChainError::Snapshot),
    }
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn an_akgchns6_precommit_reopens_as_round_zero() {
    let path = path("v6-precommit");
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();
    drop(node);

    let mut bytes = std::fs::read(&path).unwrap();
    assert!(bytes.starts_with(b"AKGCHNS7"));
    assert_eq!(&bytes[bytes.len() - 8..], &[0u8; 8]);
    bytes[..8].copy_from_slice(b"AKGCHNS6");
    bytes.truncate(bytes.len() - 8);
    bytes.extend_from_slice(&2u32.to_be_bytes());
    for (id, secret) in [
        ("validator-a", common::SECRET_A),
        ("validator-b", common::SECRET_B),
    ] {
        let mut vote = arkhe_chain::Precommit {
            validator_id: id.into(),
            height: 1,
            round: 0,
            block_hash: tip,
            signature: [0u8; 64],
        };
        arkhe_chain::sign_historical_precommit(&mut vote, &secret).unwrap();
        bytes.extend_from_slice(&1u64.to_be_bytes());
        bytes.extend_from_slice(&(id.len() as u32).to_be_bytes());
        bytes.extend_from_slice(id.as_bytes());
        bytes.extend_from_slice(&tip);
        bytes.extend_from_slice(&vote.signature);
    }
    bytes.extend_from_slice(&0u32.to_be_bytes());
    std::fs::write(&path, &bytes).unwrap();

    let again = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    assert!(std::fs::read(&path).unwrap().starts_with(b"AKGCHNS7"));
    assert_eq!(again.precommit_round(1, "validator-a").unwrap(), Some(0));
    assert_eq!(again.precommit_round(1, "validator-b").unwrap(), Some(0));
    again.bft_commit(1).unwrap();
    assert_eq!(again.tip().unwrap(), tip);
    let mut historical = arkhe_chain::Precommit {
        validator_id: "validator-a".into(),
        height: 1,
        round: 0,
        block_hash: tip,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_historical_precommit(&mut historical, &common::SECRET_A).unwrap();
    assert_eq!(
        again.note_precommit(&historical).unwrap_err(),
        ChainError::BadProposerSignature
    );
    historical.round = 1;
    assert_eq!(
        arkhe_chain::sign_historical_precommit(&mut historical, &common::SECRET_A).unwrap_err(),
        ChainError::BadProposerSignature
    );
    drop(again);

    let third = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    )
    .unwrap();
    third.bft_commit(1).unwrap();
    assert_eq!(third.height().unwrap(), 1);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn a_reopened_file_keeps_the_mldsa_key_and_refuses_a_different_one() {
    let path = path("mldsa-key");
    let (_tx, public) = {
        let mut probe = arkhe_chain::Transaction {
            nonce: 0,
            sender: GENESIS_ACCOUNT.into(),
            recipient: "bob".into(),
            value: 25,
            payload: Vec::new(),
            signature_mldsa: Vec::new(),
            sender_signature: [0u8; 64],
        };
        let public = arkhe_chain::sign_mldsa(&mut probe, &[0x68; 32]).unwrap();
        (probe, public)
    };
    let mut accounts = common::accounts();
    accounts[0].mldsa_public_key = Some(public);
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        accounts.clone(),
    )
    .unwrap();
    drop(node);

    match ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    ) {
        Ok(_) => panic!("snapshot opened with a different ML-DSA key"),
        Err(error) => assert_eq!(error, ChainError::Snapshot),
    }

    let again = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        accounts,
    )
    .unwrap();
    assert_eq!(again.height().unwrap(), 0);
    assert_eq!(again.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    let _ = std::fs::remove_file(&path);
}
