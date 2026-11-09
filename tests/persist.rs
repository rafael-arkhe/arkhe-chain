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
    std::fs::write(&path, b"AKGCHNS1").unwrap();
    match ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        validators(),
        common::accounts(),
    ) {
        Ok(_) => panic!("snapshot without the mempool opened"),
        Err(error) => assert_eq!(error, ChainError::Snapshot),
    }
    let _ = std::fs::remove_file(&path);
}
