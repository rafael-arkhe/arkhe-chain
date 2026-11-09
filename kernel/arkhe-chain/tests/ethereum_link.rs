mod common;

use arkhe_chain::{
    ethereum_link_commitment, ethereum_link_preimage, AbsentExecutionRpc, ArkheNode, ChainError,
    EthereumExecutionId, ExecutionRpc, HttpExecutionRpc, ETH_LINK_DOMAIN, GENESIS_ACCOUNT,
    GENESIS_SUPPLY,
};

const TS: u64 = 1_700_000_000;

fn execution() -> EthereumExecutionId {
    EthereumExecutionId {
        number: 21_000_000,
        hash: [0xab; 32],
    }
}

#[test]
fn a_sealed_block_can_cite_an_execution_header_without_settling() {
    let node = common::node();
    let before = node.balance(GENESIS_ACCOUNT).unwrap();
    assert_eq!(before, GENESIS_SUPPLY);
    assert_eq!(
        node.cite_ethereum_execution(1, execution()).unwrap_err(),
        ChainError::UnknownBlock
    );

    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();
    let header = node.header_at(1).unwrap();

    let link = node.cite_ethereum_execution(1, execution()).unwrap();
    assert!(!link.settled);
    assert_eq!(link.arkhe_height, 1);
    assert_eq!(link.arkhe_block_hash, tip);
    assert_eq!(link.state_root, header.state_root);
    assert_eq!(link.execution_number, 21_000_000);
    assert_eq!(link.execution_hash, [0xab; 32]);

    let preimage = ethereum_link_preimage(&header, &tip, execution());
    assert!(preimage.starts_with(ETH_LINK_DOMAIN));
    assert_eq!(link.commitment, ethereum_link_commitment(&preimage));

    let other = EthereumExecutionId {
        number: 21_000_000,
        hash: [0xcd; 32],
    };
    assert_eq!(
        node.cite_ethereum_execution(1, other).unwrap_err(),
        ChainError::EthereumConflict
    );
    assert_eq!(node.ethereum_citation(1).unwrap(), Some(link));
    assert_eq!(node.cite_ethereum_execution(1, execution()).unwrap(), link);

    assert_eq!(node.tip().unwrap(), tip);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), before - 25);
    assert_eq!(node.header_at(1).unwrap(), header);
}

#[test]
fn a_zero_execution_header_is_refused() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    for execution in [
        EthereumExecutionId {
            number: 0,
            hash: [0xab; 32],
        },
        EthereumExecutionId {
            number: 21_000_000,
            hash: [0u8; 32],
        },
    ] {
        assert_eq!(
            node.cite_ethereum_execution(1, execution).unwrap_err(),
            ChainError::EthereumHeader
        );
    }
    assert_eq!(
        node.cite_ethereum_execution(2, execution()).unwrap_err(),
        ChainError::UnknownBlock
    );
}

#[test]
fn a_reopened_file_keeps_one_citation_and_refuses_a_lower_execution_number() {
    let path = std::env::temp_dir().join(format!(
        "arkhe-chain-ethlink-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    node.ingest(common::transfer(1, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    node.propose_and_seal_block(TS + 1).unwrap();
    let link = node.cite_ethereum_execution(1, execution()).unwrap();
    assert_eq!(
        node.cite_ethereum_execution(
            2,
            EthereumExecutionId {
                number: 20_000_000,
                hash: [0xcd; 32],
            },
        )
        .unwrap_err(),
        ChainError::EthereumConflict
    );
    let later = node
        .cite_ethereum_execution(
            2,
            EthereumExecutionId {
                number: 21_000_001,
                hash: [0xcd; 32],
            },
        )
        .unwrap();
    assert!(!later.settled);
    drop(node);

    let again = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(again.ethereum_citation(1).unwrap(), Some(link));
    assert_eq!(again.ethereum_citation(2).unwrap(), Some(later));
    assert!(std::fs::read(&path).unwrap().starts_with(b"AKGCHNS7"));

    let mut older = std::fs::read(&path).unwrap();
    older[..8].copy_from_slice(b"AKGCHNS5");
    older.truncate(older.len() - (4 + 2 * (8 + 8 + 32)));
    let older_path = path.with_extension("v5");
    std::fs::write(&older_path, &older).unwrap();
    let opened = ArkheNode::open(
        &older_path,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 2);
    assert_eq!(opened.ethereum_citation(1).unwrap(), None);
    drop(opened);
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(&older_path);
}

#[test]
fn a_failed_citation_write_keeps_the_file() {
    let path = std::env::temp_dir().join(format!(
        "arkhe-chain-ethfail-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let before = std::fs::read(&path).unwrap();
    let tmp = path.with_extension("arkhe-tmp");
    std::fs::create_dir(&tmp).unwrap();
    assert_eq!(
        node.cite_ethereum_execution(1, execution()).unwrap_err(),
        ChainError::Snapshot
    );
    assert_eq!(node.ethereum_citation(1).unwrap(), None);
    assert_eq!(std::fs::read(&path).unwrap(), before);
    drop(node);
    std::fs::remove_dir(&tmp).unwrap();
    let _ = std::fs::remove_file(&path);
}

struct FixedHash([u8; 32]);

impl ExecutionRpc for FixedHash {
    fn execution_hash(&self, number: u64) -> Result<[u8; 32], ChainError> {
        assert_eq!(number, 21_000_000);
        Ok(self.0)
    }
}

#[test]
fn a_matching_execution_client_confirms_without_settling_or_writing() {
    let path = std::env::temp_dir().join(format!(
        "arkhe-chain-ethconfirm-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let stored = node.cite_ethereum_execution(1, execution()).unwrap();
    assert!(!stored.confirmed);
    let before = std::fs::read(&path).unwrap();

    assert_eq!(
        node.confirm_ethereum_execution(1, &AbsentExecutionRpc)
            .unwrap_err(),
        ChainError::RpcAbsent
    );
    assert_eq!(
        node.confirm_ethereum_execution(1, &FixedHash([0xcd; 32]))
            .unwrap_err(),
        ChainError::EthereumConflict
    );
    assert_eq!(
        node.confirm_ethereum_execution(1, &FixedHash([0u8; 32]))
            .unwrap_err(),
        ChainError::EthereumHeader
    );

    let confirmed = node
        .confirm_ethereum_execution(1, &FixedHash(execution().hash))
        .unwrap();
    assert!(confirmed.confirmed);
    assert!(!confirmed.settled);
    assert_eq!(confirmed.commitment, stored.commitment);
    assert_eq!(node.ethereum_citation(1).unwrap(), Some(stored));
    assert_eq!(std::fs::read(&path).unwrap(), before);
    drop(node);

    let again = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    let reopened = again.ethereum_citation(1).unwrap().unwrap();
    assert!(!reopened.confirmed);
    assert!(!reopened.settled);
    assert_eq!(reopened.commitment, stored.commitment);
    drop(again);
    let _ = std::fs::remove_file(&path);
}

#[test]
#[ignore = "needs ARKHE_EXECUTION_RPC pointing at a live execution client"]
fn a_live_execution_client_confirms_without_settling() {
    let endpoint = std::env::var("ARKHE_EXECUTION_RPC").expect("ARKHE_EXECUTION_RPC");
    let rpc = HttpExecutionRpc { endpoint };
    let mut hash = None;
    let mut last = String::from("no attempt");
    for _ in 0..20 {
        match rpc.execution_hash(1) {
            Ok(found) if found != [0u8; 32] => {
                hash = Some(found);
                break;
            }
            Ok(_) => last = "zero hash".to_string(),
            Err(err) => last = err.to_string(),
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    let hash = hash.unwrap_or_else(|| panic!("execution block 1: {last}"));
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let stored = node
        .cite_ethereum_execution(1, EthereumExecutionId { number: 1, hash })
        .unwrap();
    assert!(!stored.confirmed);
    let confirmed = node.confirm_ethereum_execution(1, &rpc).unwrap();
    assert!(confirmed.confirmed);
    assert!(!confirmed.settled);
    assert_eq!(node.ethereum_citation(1).unwrap().unwrap().confirmed, false);
}
