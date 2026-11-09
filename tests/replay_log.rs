mod common;

use arkhe_chain::{
    encode_block, format_replay, parse_replay, ChainError, GENESIS_ACCOUNT, GENESIS_SUPPLY,
};

const TS: u64 = 1_700_000_000;

#[test]
fn import_writes_a_replay_record_the_parser_reads_back() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 11))
        .unwrap();
    let block = source.propose_and_seal_block(TS).unwrap().block.unwrap();
    let bytes = encode_block(&block);

    let node = common::node();
    node.import_block(&bytes).unwrap();
    let record = node.last_replay().unwrap().expect("replay");
    assert!(record.adopted);
    assert_eq!(record.height, 1);
    assert_eq!(record.tx_count, 1);
    assert!(record.error.is_none());
    let line = format_replay(&record).unwrap();
    assert_eq!(parse_replay(&line).unwrap(), record);
    assert_eq!(node.balance("bob").unwrap(), 11);

    let mut tampered = block;
    let last = tampered.transactions[0].payload.len() - 1;
    tampered.transactions[0].payload[last] ^= 0xff;
    common::sign(&mut tampered);
    let rejected = common::node();
    assert_eq!(
        rejected.import_block(&encode_block(&tampered)).unwrap_err(),
        ChainError::StateMismatch
    );
    let failed = rejected.last_replay().unwrap().expect("failed replay");
    assert!(!failed.adopted);
    assert_eq!(failed.error.as_deref(), Some("FAIL_CLOSED: STATE_MISMATCH"));
    assert_eq!(
        parse_replay(&format_replay(&failed).unwrap()).unwrap(),
        failed
    );
    assert_eq!(rejected.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(rejected.height().unwrap(), 0);

    assert_eq!(
        parse_replay(r#"{"height":1,"tx_count":1,"elapsed_ns":1,"adopted":true,"error":"x"}"#)
            .unwrap_err(),
        ChainError::Malformed
    );
}
