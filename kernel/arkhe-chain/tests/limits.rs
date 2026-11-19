mod common;

use arkhe_chain::{
    encode_block, AnchorPublisher, ArkheNode, ChainError, Precommit, Transaction, GENESIS_ACCOUNT,
    GENESIS_SUPPLY, MLDSA65_SIG_LEN,
};

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

fn shaped(sender: &str, recipient: &str, payload: Vec<u8>) -> Transaction {
    Transaction {
        nonce: 0,
        sender: sender.into(),
        recipient: recipient.into(),
        value: 1,
        payload,
        signature_mldsa: vec![0; MLDSA65_SIG_LEN],
        sender_signature: [0; 64],
    }
}

fn refused(
    node_id: &str,
    secret: &[u8; 32],
    validators: Vec<arkhe_chain::Validator>,
    accounts: Vec<arkhe_chain::Account>,
) -> ChainError {
    match ArkheNode::new(node_id, secret, validators, accounts) {
        Ok(_) => panic!("node opened"),
        Err(error) => error,
    }
}

fn open(name: &str) -> (std::path::PathBuf, ArkheNode) {
    let path = path(name);
    let node = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    (path, node)
}

#[test]
fn a_node_refuses_an_empty_set_a_bad_id_and_a_mismatched_key() {
    assert_eq!(
        refused(
            "validator-a",
            &common::SECRET_A,
            Vec::new(),
            common::accounts()
        ),
        ChainError::EmptyValidators
    );
    assert_eq!(
        refused(
            "validator a",
            &common::SECRET_A,
            common::validators(),
            common::accounts()
        ),
        ChainError::BadAccount
    );
    assert_eq!(
        refused(
            &"a".repeat(129),
            &common::SECRET_A,
            common::validators(),
            common::accounts()
        ),
        ChainError::BadAccount
    );
    assert_eq!(
        refused(
            "",
            &common::SECRET_A,
            common::validators(),
            common::accounts()
        ),
        ChainError::BadAccount
    );
    assert_eq!(
        refused(
            "validator-c",
            &common::SECRET_A,
            common::validators(),
            common::accounts()
        ),
        ChainError::NotProposer
    );
    assert_eq!(
        refused(
            "validator-a",
            &common::SECRET_B,
            common::validators(),
            common::accounts()
        ),
        ChainError::BadProposerKey
    );

    let mut validators = common::validators();
    validators.push(validators[0].clone());
    assert_eq!(
        refused(
            "validator-a",
            &common::SECRET_A,
            validators,
            common::accounts()
        ),
        ChainError::BadAccount
    );
    let mut named = common::validators();
    named[0].id = "bad id".into();
    assert_eq!(
        refused("validator-a", &common::SECRET_A, named, common::accounts()),
        ChainError::BadAccount
    );
    let mut zero_key = common::validators();
    zero_key[0].public_key = [0; 32];
    assert_eq!(
        refused(
            "validator-a",
            &common::SECRET_A,
            zero_key,
            common::accounts()
        ),
        ChainError::BadProposerKey
    );

    let mut accounts = common::accounts();
    accounts.push(accounts[0].clone());
    assert_eq!(
        refused(
            "validator-a",
            &common::SECRET_A,
            common::validators(),
            accounts
        ),
        ChainError::BadAccount
    );
    let mut unnamed = common::accounts();
    unnamed[0].id = "bob ops".into();
    assert_eq!(
        refused(
            "validator-a",
            &common::SECRET_A,
            common::validators(),
            unnamed
        ),
        ChainError::BadAccount
    );
    let mut zero_account = common::accounts();
    zero_account[0].public_key = [0; 32];
    let node = ArkheNode::new(
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        zero_account,
    )
    .unwrap();
    assert_eq!(
        node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
            .unwrap_err(),
        ChainError::UnverifiedSignature
    );
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
}

#[test]
fn shape_rejects_a_long_payload_a_bad_account_and_a_missing_key() {
    let node = common::node();
    assert_eq!(
        node.ingest(shaped("bob ops", "carol", Vec::new()))
            .unwrap_err(),
        ChainError::BadAccount
    );
    assert_eq!(
        node.ingest(shaped("bob_ops", "carol", Vec::new()))
            .unwrap_err(),
        ChainError::UnverifiedSignature
    );
    assert_eq!(
        node.ingest(shaped("", "carol", Vec::new())).unwrap_err(),
        ChainError::BadAccount
    );
    let long = "a".repeat(129);
    assert_eq!(
        node.ingest(shaped("genesis-alloc", &long, Vec::new()))
            .unwrap_err(),
        ChainError::BadAccount
    );
    let boundary = "a".repeat(128);
    assert_eq!(
        node.ingest(shaped("genesis-alloc", &boundary, Vec::new()))
            .unwrap_err(),
        ChainError::UnverifiedSignature
    );
    assert_eq!(
        node.ingest(shaped("genesis-alloc", "bob", vec![0; 4097]))
            .unwrap_err(),
        ChainError::Admission("payload")
    );
    assert_eq!(
        node.ingest(shaped("genesis-alloc", "bob", vec![0; 4096]))
            .unwrap_err(),
        ChainError::UnverifiedSignature
    );
    assert_eq!(
        node.ingest(shaped("stranger", "bob", Vec::new()))
            .unwrap_err(),
        ChainError::UnverifiedSignature
    );

    let mut accounts = common::accounts();
    accounts[0].mldsa_public_key = None;
    let bare = ArkheNode::new(
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        accounts,
    )
    .unwrap();
    assert_eq!(
        bare.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
            .unwrap_err(),
        ChainError::UnverifiedSignature
    );
    assert_eq!(node.mempool_len().unwrap(), 0);
    assert_eq!(bare.mempool_len().unwrap(), 0);
    assert_eq!(bare.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(bare.balance("bob").unwrap(), 0);
}

#[test]
fn an_oversized_or_empty_body_is_malformed_and_does_not_move_the_tip() {
    let node = common::node();
    assert_eq!(node.import_block(&[]).unwrap_err(), ChainError::Malformed);
    assert_eq!(
        node.import_block(&vec![0; 2 * 1024 * 1024 + 1])
            .unwrap_err(),
        ChainError::Malformed
    );
    assert_eq!(node.height().unwrap(), 0);
    assert_eq!(node.tip().unwrap(), [0; 32]);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    let replay = node.last_replay().unwrap().unwrap();
    assert!(!replay.adopted);
    assert_eq!(replay.height, 0);
    assert_eq!(replay.tx_count, 0);
}

#[test]
fn an_address_without_forty_hex_digits_is_not_an_anchor() {
    let root = [0xab; 32];
    for address in [
        "1111111111111111111111111111111111111111",
        "0x111111111111111111111111111111111111111",
        "0x111111111111111111111111111111111111111g",
        "0x",
    ] {
        assert_eq!(
            AnchorPublisher {
                evm_contract_address: address.into(),
            }
            .plan(&root)
            .unwrap_err(),
            ChainError::AnchorAddress
        );
    }
}

#[test]
fn the_canonical_child_is_only_the_next_sealed_block() {
    let node = common::node();
    assert_eq!(node.canonical_child(&[0; 32]).unwrap(), None);
    assert_eq!(node.header_at(1).unwrap_err(), ChainError::UnknownBlock);
    assert_eq!(node.encoded_block(&[9; 32]).unwrap(), None);

    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    let block = node.propose_and_seal_block(TS).unwrap().block.unwrap();
    let bytes = encode_block(&block);
    let tip = node.tip().unwrap();
    assert_eq!(
        node.canonical_child(&[0; 32]).unwrap().as_deref(),
        Some(bytes.as_slice())
    );
    assert_eq!(node.canonical_child(&tip).unwrap(), None);
    assert_eq!(node.canonical_child(&[9; 32]).unwrap(), None);
    assert_eq!(node.header_at(1).unwrap(), block.header);
    assert_eq!(
        node.encoded_block(&tip).unwrap().as_deref(),
        Some(bytes.as_slice())
    );
    assert_eq!(node.header_at(2).unwrap_err(), ChainError::UnknownBlock);
}

#[test]
fn a_foreign_proposer_is_not_imported() {
    let foreign = common::outsider();
    foreign
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    let block = foreign.propose_and_seal_block(TS).unwrap().block.unwrap();
    assert_eq!(block.header.proposer, "validator-c");

    let node = common::node();
    assert_eq!(
        node.import_block(&encode_block(&block)).unwrap_err(),
        ChainError::NotProposer
    );
    assert_eq!(node.height().unwrap(), 0);
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
}

#[test]
fn a_precommit_on_a_fork_is_not_stored_and_a_repeat_vote_stays_one() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();

    let unknown = Precommit {
        validator_id: "validator-c".into(),
        height: 1,
        round: 0,
        parts: 1,
        part_hash: tip,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: tip,
        signature: [0; 64],
    };
    assert_eq!(
        node.note_precommit(&unknown).unwrap_err(),
        ChainError::NotProposer
    );

    let mut vote = Precommit {
        validator_id: "validator-b".into(),
        height: 1,
        round: 0,
        parts: 1,
        part_hash: tip,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: tip,
        signature: [0; 64],
    };
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_B).unwrap();
    node.note_precommit(&vote).unwrap();
    node.note_precommit(&vote).unwrap();
    assert_eq!(node.precommit_count(1).unwrap(), 1);
    assert_eq!(
        node.precommit_count(2).unwrap_err(),
        ChainError::UnknownBlock
    );
    assert_eq!(node.bft_commit(1).unwrap_err(), ChainError::QuorumAbsent);

    let other = common::peer();
    other
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    let rival = other.propose_and_seal_block(TS).unwrap().block.unwrap();
    let rival_bytes = encode_block(&rival);
    assert_eq!(
        node.import_block(&rival_bytes).unwrap_err(),
        ChainError::Fork
    );

    let mut broken = rival.clone();
    broken.header.state_root[0] ^= 0x01;
    arkhe_chain::sign_proposer(&mut broken, &common::SECRET_B).unwrap();
    assert_eq!(
        node.import_block(&encode_block(&broken)).unwrap_err(),
        ChainError::StateMismatch
    );
    let mut rewound = rival;
    rewound.header.timestamp = 0;
    arkhe_chain::sign_proposer(&mut rewound, &common::SECRET_B).unwrap();
    assert_eq!(
        node.import_block(&encode_block(&rewound)).unwrap_err(),
        ChainError::BadTimestamp
    );
    assert_eq!(node.fork_count().unwrap(), 1);
    assert_eq!(node.tip().unwrap(), tip);
    assert_eq!(node.balance("bob").unwrap(), 25);
    assert_eq!(node.balance("carol").unwrap(), 0);

    vote.block_hash = other.tip().unwrap();
    vote.part_hash = vote.block_hash;
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_B).unwrap();
    assert_eq!(node.note_precommit(&vote).unwrap_err(), ChainError::Fork);
    assert_eq!(node.precommit_count(1).unwrap(), 1);
    assert_eq!(node.bft_commit(1).unwrap_err(), ChainError::QuorumAbsent);
}

#[test]
fn a_failed_ingest_write_drops_the_transaction() {
    let (path, node) = open("ingest-write");
    let before = std::fs::read(&path).unwrap();
    let tmp = path.with_extension("arkhe-tmp");
    std::fs::create_dir(&tmp).unwrap();
    assert_eq!(
        node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
            .unwrap_err(),
        ChainError::Snapshot
    );
    assert_eq!(node.mempool_len().unwrap(), 0);
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(std::fs::read(&path).unwrap(), before);

    std::fs::remove_dir(&tmp).unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    assert_eq!(node.mempool_len().unwrap(), 1);
    drop(node);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn a_failed_fork_write_does_not_keep_the_sibling() {
    let (path, node) = open("fork-write");
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();
    let before = std::fs::read(&path).unwrap();
    let tmp = path.with_extension("arkhe-tmp");
    std::fs::create_dir(&tmp).unwrap();

    let other = common::peer();
    other
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    let rival = other.propose_and_seal_block(TS).unwrap().block.unwrap();
    assert_eq!(
        node.import_block(&encode_block(&rival)).unwrap_err(),
        ChainError::Snapshot
    );
    assert_eq!(node.fork_count().unwrap(), 0);
    assert_eq!(node.tip().unwrap(), tip);
    assert_eq!(node.balance("bob").unwrap(), 25);
    assert_eq!(node.balance("carol").unwrap(), 0);
    assert_eq!(std::fs::read(&path).unwrap(), before);

    std::fs::remove_dir(&tmp).unwrap();
    assert_eq!(
        node.import_block(&encode_block(&rival)).unwrap_err(),
        ChainError::Fork
    );
    assert_eq!(node.fork_count().unwrap(), 1);
    assert_eq!(node.tip().unwrap(), tip);
    drop(node);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn a_failed_precommit_write_does_not_keep_the_vote() {
    let (path, node) = open("precommit-write");
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();
    let before = std::fs::read(&path).unwrap();
    let tmp = path.with_extension("arkhe-tmp");
    std::fs::create_dir(&tmp).unwrap();

    let mut vote = Precommit {
        validator_id: "validator-a".into(),
        height: 1,
        round: 0,
        parts: 1,
        part_hash: tip,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: tip,
        signature: [0; 64],
    };
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_A).unwrap();
    assert_eq!(
        node.note_precommit(&vote).unwrap_err(),
        ChainError::Snapshot
    );
    assert_eq!(node.precommit_count(1).unwrap(), 0);
    assert_eq!(node.bft_commit(1).unwrap_err(), ChainError::QuorumAbsent);
    assert_eq!(std::fs::read(&path).unwrap(), before);

    std::fs::remove_dir(&tmp).unwrap();
    node.note_precommit(&vote).unwrap();
    assert_eq!(node.precommit_count(1).unwrap(), 1);
    assert_eq!(node.bft_commit(1).unwrap_err(), ChainError::QuorumAbsent);
    drop(node);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn an_empty_file_and_a_trailing_byte_do_not_open() {
    let empty = path("empty");
    std::fs::write(&empty, []).unwrap();
    match ArkheNode::open(
        &empty,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    ) {
        Ok(_) => panic!("empty snapshot opened"),
        Err(error) => assert_eq!(error, ChainError::Snapshot),
    }
    let _ = std::fs::remove_file(&empty);

    let (path, node) = open("trailing");
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    drop(node);
    let mut bytes = std::fs::read(&path).unwrap();
    bytes.push(0);
    std::fs::write(&path, &bytes).unwrap();
    match ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    ) {
        Ok(_) => panic!("trailing byte opened"),
        Err(error) => assert_eq!(error, ChainError::Snapshot),
    }
    bytes.pop();
    std::fs::write(&path, &bytes).unwrap();
    let again = ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(again.mempool_len().unwrap(), 1);
    assert_eq!(again.height().unwrap(), 0);
    let _ = std::fs::remove_file(&path);
}
