mod common;

use arkhe_chain::{encode_block, load_emergency_halt, ChainError, GENESIS_ACCOUNT, GENESIS_SUPPLY};

const TS: u64 = 1_700_000_000;
const SHIPPED: &str = include_str!("../arkhe-chain.properties");

#[test]
fn shipped_properties_leave_the_halt_off() {
    assert_eq!(load_emergency_halt(SHIPPED), Ok(false));
}

#[test]
fn halt_blocks_ingest_seal_and_import_without_moving_balances() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 9))
        .unwrap();
    let block = source.propose_and_seal_block(TS).unwrap().block.unwrap();
    let bytes = encode_block(&block);

    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 4))
        .unwrap();
    assert_eq!(node.apply_emergency_halt("emergency.halt=true\n"), Ok(true));
    assert!(node.emergency_halt().unwrap());
    assert_eq!(
        node.ingest(common::transfer(1, GENESIS_ACCOUNT, "dave", 1))
            .unwrap_err(),
        ChainError::EmergencyHalt
    );
    assert_eq!(
        node.propose_and_seal_block(TS).unwrap_err(),
        ChainError::EmergencyHalt
    );
    assert_eq!(
        node.import_block(&bytes).unwrap_err(),
        ChainError::EmergencyHalt
    );
    assert_eq!(node.mempool_len().unwrap(), 1);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.balance("carol").unwrap(), 0);
    assert_eq!(node.height().unwrap(), 0);

    assert_eq!(
        node.apply_emergency_halt("# resume\nemergency.halt=false\n"),
        Ok(false)
    );
    node.propose_and_seal_block(TS).unwrap();
    assert_eq!(node.balance("carol").unwrap(), 4);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
}

#[test]
fn a_bad_halt_file_stops_the_node() {
    let node = common::node();
    assert_eq!(
        node.apply_emergency_halt("emergency.halt=yes\n")
            .unwrap_err(),
        ChainError::HaltConfig
    );
    assert!(node.emergency_halt().unwrap());
    assert_eq!(
        node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
            .unwrap_err(),
        ChainError::EmergencyHalt
    );
    assert_eq!(
        load_emergency_halt("other=true\n").unwrap_err(),
        ChainError::HaltConfig
    );
    assert_eq!(
        load_emergency_halt("emergency.halt=false\nemergency.halt=true\n").unwrap_err(),
        ChainError::HaltConfig
    );
}
