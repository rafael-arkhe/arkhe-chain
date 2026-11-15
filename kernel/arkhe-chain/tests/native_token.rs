mod common;

use std::collections::BTreeMap;

use arkhe_chain::{apply_transfer, encode_block, ChainError, GENESIS_ACCOUNT, GENESIS_SUPPLY};
use arkhe_core::decision::{Decision, DecisionReason, DecisionVerdict};
use arkhe_verify_core::rbb::mmr::Frontier;

const TS: u64 = 1_700_000_000;

#[test]
fn with_accounts_loads_keys_without_a_signing_node() {
    let state = arkhe_chain::ChainState::with_accounts(common::accounts()).unwrap();
    assert_eq!(state.balance(GENESIS_ACCOUNT), GENESIS_SUPPLY);
    assert_eq!(state.height, 0);
}

#[test]
fn ingest_reads_a_canonical_cbor_decision_verdict() {
    let tx = common::transfer(0, GENESIS_ACCOUNT, "bob", 25);
    let verdict = DecisionVerdict::from_canonical_bytes(&tx.payload).unwrap();
    assert_eq!(verdict.version, 1);
    assert_eq!(verdict.decision, Decision::Allow);
    assert_eq!(verdict.reason, DecisionReason::RuleAllowed);
    assert_eq!(verdict.subject, tx.subject());
    assert_eq!(verdict.event_type, "chain-transfer");
    assert_eq!(verdict.policy_id, "chain-v1");
    assert_eq!(verdict.rule_id.as_deref(), Some("transfer"));

    let node = common::node();
    node.ingest(tx).unwrap();
    assert_eq!(node.mempool_len().unwrap(), 1);
    let mut not_cbor = common::transfer(1, GENESIS_ACCOUNT, "bob", 1);
    not_cbor.payload = b"{}".to_vec();
    assert_eq!(
        node.ingest(not_cbor).unwrap_err(),
        ChainError::Admission("verdict")
    );
    assert_eq!(node.mempool_len().unwrap(), 1);
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
}

#[test]
fn an_unverified_mldsa_blob_does_not_move_a_balance() {
    let node = common::node();
    let mut claimed = common::transfer(0, GENESIS_ACCOUNT, "bob", 25);
    claimed.signature_mldsa = vec![0x11; arkhe_chain::MLDSA65_SIG_LEN];
    assert_eq!(
        node.ingest(claimed).unwrap_err(),
        ChainError::UnverifiedSignature
    );
    assert_eq!(node.mempool_len().unwrap(), 0);
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    assert_eq!(node.mempool_len().unwrap(), 1);

    let mut unsigned = common::transfer(1, GENESIS_ACCOUNT, "bob", 1);
    unsigned.signature_mldsa.clear();
    let unsigned = common::rebind(&unsigned);
    assert_eq!(
        node.ingest(unsigned).unwrap_err(),
        ChainError::UnverifiedSignature
    );
    assert_eq!(node.mempool_len().unwrap(), 1);
    assert_eq!(node.balance("bob").unwrap(), 0);
}

#[test]
fn a_verified_mldsa65_signature_moves_the_balance_and_a_flipped_one_does_not() {
    let (tx, public) = common::mldsa_transfer(0, GENESIS_ACCOUNT, "bob", 25);
    assert_eq!(tx.signature_mldsa.len(), arkhe_chain::MLDSA65_SIG_LEN);
    let mut accounts = common::accounts();
    accounts[0].mldsa_public_key = Some(public);
    let node = arkhe_chain::ArkheNode::new(
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        accounts.clone(),
    )
    .unwrap();
    node.ingest(tx.clone()).unwrap();
    node.propose_and_seal_block(TS).unwrap();
    assert_eq!(node.balance("bob").unwrap(), 25);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY - 25);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);

    let without = common::accounts();
    let mut without_key_accounts = without;
    without_key_accounts[0].mldsa_public_key = None;
    let without_key = arkhe_chain::ArkheNode::new(
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        without_key_accounts,
    )
    .unwrap();
    assert_eq!(
        without_key.ingest(tx.clone()).unwrap_err(),
        ChainError::UnverifiedSignature
    );
    assert_eq!(without_key.balance("bob").unwrap(), 0);

    let mut flipped = tx;
    flipped.signature_mldsa[0] ^= 0xff;
    let flipped = common::rebind(&flipped);
    let fresh = arkhe_chain::ArkheNode::new(
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        accounts,
    )
    .unwrap();
    assert_eq!(
        fresh.ingest(flipped).unwrap_err(),
        ChainError::UnverifiedSignature
    );
    assert_eq!(fresh.balance("bob").unwrap(), 0);
    assert_eq!(fresh.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
}

#[test]
fn a_missing_sender_signature_does_not_move_a_balance() {
    let node = common::node();
    let mut unsigned = common::transfer(0, GENESIS_ACCOUNT, "bob", 25);
    unsigned.sender_signature = [0u8; 64];
    assert_eq!(
        node.ingest(unsigned).unwrap_err(),
        ChainError::UnverifiedSignature
    );
    assert_eq!(node.mempool_len().unwrap(), 0);
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.height().unwrap(), 0);
}

#[test]
fn transfer_debits_sender_credits_recipient_and_conserves_supply() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 40))
        .unwrap();
    node.ingest(common::transfer(1, GENESIS_ACCOUNT, "carol", 60))
        .unwrap();
    let proposal = node.propose_and_seal_block(TS).unwrap();
    let block = proposal.block.expect("sealed");
    assert!(proposal.rejected.is_empty());
    assert_eq!(block.transactions.len(), 2);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY - 100);
    assert_eq!(node.balance("bob").unwrap(), 40);
    assert_eq!(node.balance("carol").unwrap(), 60);
    assert_eq!(node.balance("unknown").unwrap(), 0);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.height().unwrap(), 1);
}

#[test]
fn insufficient_balance_is_rejected_before_the_mempool() {
    let node = common::node();
    let error = node
        .ingest(common::transfer(
            0,
            GENESIS_ACCOUNT,
            "bob",
            GENESIS_SUPPLY + 1,
        ))
        .unwrap_err();
    assert_eq!(error, ChainError::InsufficientBalance);
    assert_eq!(node.mempool_len().unwrap(), 0);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(node.height().unwrap(), 0);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
}

#[test]
fn overflow_and_self_transfer_leave_balances_unchanged() {
    let mut balances =
        BTreeMap::from([("alice".to_string(), u64::MAX - 1), ("bob".to_string(), 2)]);
    let before = balances.clone();
    assert_eq!(
        apply_transfer(&mut balances, "bob", "alice", 2),
        Err(ChainError::Overflow)
    );
    assert_eq!(balances, before);
    assert_eq!(
        apply_transfer(&mut balances, "alice", "alice", 1),
        Err(ChainError::SelfTransfer)
    );
    assert_eq!(balances, before);
    assert_eq!(apply_transfer(&mut balances, "bob", "alice", 0), Ok(()));
    assert_eq!(balances, before);
    assert_eq!(
        apply_transfer(&mut balances, "missing", "alice", 1),
        Err(ChainError::InsufficientBalance)
    );
    assert_eq!(balances, before);

    let node = common::node();
    let error = node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, GENESIS_ACCOUNT, 1))
        .unwrap_err();
    assert_eq!(error, ChainError::SelfTransfer);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
}

#[test]
fn replayed_nonce_does_not_move_value_twice() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 15))
        .unwrap();
    let error = node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 15))
        .unwrap_err();
    assert_eq!(error, ChainError::BadNonce);
    node.propose_and_seal_block(TS).unwrap();
    assert_eq!(node.balance("bob").unwrap(), 15);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY - 15);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
}

#[test]
fn zero_value_appends_the_mmr_without_moving_balances() {
    let node = common::node();
    let tx = common::transfer(0, GENESIS_ACCOUNT, "bob", 0);
    let mut frontier = Frontier::default();
    let index = frontier.append(&tx.record()).unwrap();
    node.ingest(tx).unwrap();
    node.propose_and_seal_block(TS).unwrap();
    assert_eq!(index, 0);
    assert_eq!(node.mmr_count().unwrap(), 1);
    assert_eq!(node.mmr_root().unwrap(), frontier.root().unwrap());
    assert_ne!(
        node.header_at(1).unwrap().state_root,
        node.mmr_root().unwrap()
    );
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
}

#[test]
fn containment_reject_emergency_stop_and_subject_mismatch_do_not_enter() {
    let node = common::node();
    assert_eq!(
        node.ingest(common::rejected_transfer(0, GENESIS_ACCOUNT, "bob", 1))
            .unwrap_err(),
        ChainError::Admission("not-allow")
    );
    assert_eq!(
        node.ingest(common::stopped_transfer(0, GENESIS_ACCOUNT, "bob", 1))
            .unwrap_err(),
        ChainError::Admission("not-allow")
    );
    let tx = common::transfer(0, GENESIS_ACCOUNT, "bob", 1);
    assert_eq!(
        node.ingest(common::mismatched_subject(&tx)).unwrap_err(),
        ChainError::Admission("subject")
    );
    assert_eq!(node.mempool_len().unwrap(), 0);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(
        node.propose_and_seal_block(TS).unwrap_err(),
        ChainError::MempoolEmpty
    );
}

#[test]
fn a_reject_does_not_consume_the_nonce() {
    let node = common::node();
    assert_eq!(
        node.ingest(common::rejected_transfer(0, GENESIS_ACCOUNT, "bob", 40))
            .unwrap_err(),
        ChainError::Admission("not-allow")
    );
    assert_eq!(
        node.ingest(common::stopped_transfer(0, GENESIS_ACCOUNT, "bob", 40))
            .unwrap_err(),
        ChainError::Admission("not-allow")
    );
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 40))
        .unwrap();
    let block = node.propose_and_seal_block(TS).unwrap().block.unwrap();
    assert_eq!(block.transactions.len(), 1);
    assert_eq!(block.transactions[0].nonce, 0);
    assert_eq!(node.balance("bob").unwrap(), 40);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY - 40);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.height().unwrap(), 1);
    assert_eq!(node.mmr_count().unwrap(), 1);
    assert_eq!(node.mempool_len().unwrap(), 0);
}

#[test]
fn import_replays_the_same_balances_and_a_tampered_block_does_not() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    let sealed = source.propose_and_seal_block(TS).unwrap().block.unwrap();
    let bytes = encode_block(&sealed);
    let replica = common::node();
    replica.import_block(&bytes).unwrap();
    assert_eq!(replica.balance("bob").unwrap(), 25);
    assert_eq!(
        replica.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 25
    );
    assert_eq!(replica.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(replica.tip().unwrap(), source.tip().unwrap());
    assert_eq!(replica.mmr_root().unwrap(), source.mmr_root().unwrap());

    let mut tampered = sealed.clone();
    let last = tampered.transactions[0].payload.len() - 1;
    tampered.transactions[0].payload[last] ^= 0xff;
    common::sign(&mut tampered);
    let untouched = common::node();
    assert_eq!(
        untouched
            .import_block(&encode_block(&tampered))
            .unwrap_err(),
        ChainError::Admission("policy")
    );
    assert_eq!(untouched.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(untouched.balance("bob").unwrap(), 0);
    assert_eq!(untouched.height().unwrap(), 0);
}

#[test]
fn import_drops_stale_mempool_entries_and_keeps_the_next_nonce() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    let sealed = source.propose_and_seal_block(TS).unwrap().block.unwrap();
    let bytes = encode_block(&sealed);

    let replica = common::node();
    replica
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 80))
        .unwrap();
    replica
        .ingest(common::transfer(1, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    let mut tampered = sealed.clone();
    let last = tampered.transactions[0].payload.len() - 1;
    tampered.transactions[0].payload[last] ^= 0xff;
    common::sign(&mut tampered);
    assert_eq!(
        replica
            .import_block(&encode_block(&tampered))
            .unwrap_err(),
        ChainError::Admission("policy")
    );
    assert_eq!(replica.mempool_len().unwrap(), 2);
    assert_eq!(replica.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);

    replica.import_block(&bytes).unwrap();
    assert_eq!(replica.mempool_len().unwrap(), 1);
    assert_eq!(replica.balance("bob").unwrap(), 25);
    assert_eq!(replica.balance("carol").unwrap(), 0);
    assert_eq!(
        replica.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 25
    );
    let block = replica.propose_and_seal_block(TS + 1).unwrap().block.unwrap();
    assert_eq!(block.transactions.len(), 1);
    assert_eq!(block.transactions[0].nonce, 1);
    assert_eq!(replica.balance("carol").unwrap(), 10);
    assert_eq!(
        replica.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 35
    );
    assert_eq!(replica.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(replica.mempool_len().unwrap(), 0);
    assert_eq!(replica.mmr_count().unwrap(), 2);
}

#[test]
fn state_root_covers_balances_and_nonces() {
    let source = common::node();
    source
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    let sealed = source.propose_and_seal_block(TS).unwrap().block.unwrap();
    assert_ne!(sealed.header.state_root, source.mmr_root().unwrap());

    let replica = common::node();
    replica.import_block(&encode_block(&sealed)).unwrap();
    assert_eq!(replica.balance("bob").unwrap(), 25);
    assert_eq!(replica.header_at(1).unwrap().state_root, sealed.header.state_root);

    let mut forged = sealed.clone();
    forged.header.state_root = source.mmr_root().unwrap();
    common::sign(&mut forged);
    let fresh = common::node();
    assert_eq!(
        fresh.import_block(&encode_block(&forged)).unwrap_err(),
        ChainError::StateMismatch
    );
    assert_eq!(fresh.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(fresh.balance("bob").unwrap(), 0);
    assert_eq!(fresh.height().unwrap(), 0);
    assert_eq!(fresh.mmr_count().unwrap(), 0);
}

#[test]
fn timestamp_must_advance_and_a_rewound_block_is_not_imported() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    assert_eq!(
        node.propose_and_seal_block(0).unwrap_err(),
        ChainError::BadTimestamp
    );
    assert_eq!(node.mempool_len().unwrap(), 1);
    assert_eq!(node.height().unwrap(), 0);

    let first = node.propose_and_seal_block(TS).unwrap().block.unwrap();
    node.ingest(common::transfer(1, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    assert_eq!(
        node.propose_and_seal_block(TS).unwrap_err(),
        ChainError::BadTimestamp
    );
    assert_eq!(node.height().unwrap(), 1);
    assert_eq!(node.mempool_len().unwrap(), 1);
    let second = node.propose_and_seal_block(TS + 1).unwrap().block.unwrap();

    let replica = common::node();
    replica.import_block(&encode_block(&first)).unwrap();
    let mut zero = first.clone();
    zero.header.timestamp = 0;
    common::sign(&mut zero);
    let fresh = common::node();
    assert_eq!(
        fresh.import_block(&encode_block(&zero)).unwrap_err(),
        ChainError::BadTimestamp
    );
    assert_eq!(fresh.height().unwrap(), 0);
    assert_eq!(fresh.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);

    let mut rewound = second.clone();
    rewound.header.timestamp = TS;
    common::sign(&mut rewound);
    assert_eq!(
        replica.import_block(&encode_block(&rewound)).unwrap_err(),
        ChainError::BadTimestamp
    );
    assert_eq!(replica.height().unwrap(), 1);
    assert_eq!(replica.balance("bob").unwrap(), 25);
    assert_eq!(replica.balance("carol").unwrap(), 0);
    assert_eq!(replica.supply().unwrap(), GENESIS_SUPPLY);
}

#[test]
fn a_second_block_by_the_same_proposer_at_the_same_height_is_equivocation() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    let sealed = node.propose_and_seal_block(TS).unwrap().block.unwrap();
    let tip = node.tip().unwrap();

    let other = common::node();
    other
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    let rival = other.propose_and_seal_block(TS).unwrap().block.unwrap();
    assert_eq!(rival.header.proposer, sealed.header.proposer);
    assert_eq!(rival.header.block_number, sealed.header.block_number);

    assert_eq!(
        node.import_block(&encode_block(&rival)).unwrap_err(),
        ChainError::Equivocation
    );
    assert_eq!(
        node.import_block(&encode_block(&sealed)).unwrap_err(),
        ChainError::ParentMismatch
    );
    let mut foreign = rival;
    foreign.header.proposer = "validator-b".into();
    assert_eq!(
        node.import_block(&encode_block(&foreign)).unwrap_err(),
        ChainError::BadProposerSignature
    );
    assert_eq!(node.height().unwrap(), 1);
    assert_eq!(node.balance("bob").unwrap(), 25);
    assert_eq!(node.balance("carol").unwrap(), 0);
    assert_eq!(
        node.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 25
    );
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.tip().unwrap(), tip);
}

#[test]
fn canonical_depth_is_the_only_finality() {
    let node = common::node();
    assert_eq!(node.finality(0).unwrap_err(), ChainError::UnknownBlock);
    assert_eq!(node.finality(1).unwrap_err(), ChainError::UnknownBlock);

    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    assert_eq!(
        node.finality(1).unwrap(),
        arkhe_chain::Finality { height: 1, depth: 0 }
    );

    node.ingest(common::transfer(1, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    node.propose_and_seal_block(TS + 1).unwrap();
    assert_eq!(
        node.finality(1).unwrap(),
        arkhe_chain::Finality { height: 1, depth: 1 }
    );
    assert_eq!(
        node.finality(2).unwrap(),
        arkhe_chain::Finality { height: 2, depth: 0 }
    );
    assert_eq!(node.finality(3).unwrap_err(), ChainError::UnknownBlock);

    let other = common::node();
    other
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    let rival = other.propose_and_seal_block(TS).unwrap().block.unwrap();
    assert_eq!(
        node.import_block(&encode_block(&rival)).unwrap_err(),
        ChainError::Equivocation
    );
    assert_eq!(
        node.finality(1).unwrap(),
        arkhe_chain::Finality { height: 1, depth: 1 }
    );
    assert_eq!(node.balance("bob").unwrap(), 25);
    assert_eq!(node.balance("carol").unwrap(), 10);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
}

#[test]
fn two_local_precommits_meet_the_weight_threshold_without_moving_the_tip() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();
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
    assert_eq!(
        node.note_precommit(&vote).unwrap_err(),
        ChainError::BadProposerSignature
    );
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_B).unwrap();
    node.note_precommit(&vote).unwrap();
    assert_eq!(node.precommit_count(1).unwrap(), 1);
    assert_eq!(node.bft_commit(1).unwrap_err(), ChainError::QuorumAbsent);
    vote.validator_id = "validator-a".into();
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_A).unwrap();
    node.note_precommit(&vote).unwrap();
    assert_eq!(node.precommit_count(1).unwrap(), 2);
    node.bft_commit(1).unwrap();
    assert_eq!(
        node.finality(1).unwrap(),
        arkhe_chain::Finality { height: 1, depth: 0 }
    );
    assert_eq!(node.tip().unwrap(), tip);
    assert_eq!(node.balance("bob").unwrap(), 25);

    vote.block_hash[0] ^= 0x01;
    vote.part_hash = vote.block_hash;
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_A).unwrap();
    assert_eq!(
        node.note_precommit(&vote).unwrap_err(),
        ChainError::UnknownBlock
    );
    assert_eq!(node.precommit_count(1).unwrap(), 2);
    assert_eq!(node.bft_commit(0).unwrap_err(), ChainError::UnknownBlock);
}

#[test]
fn a_block_without_the_proposer_signature_does_not_move_balances() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    let block = node.propose_and_seal_block(TS).unwrap().block.unwrap();
    let replica = common::node();
    replica.import_block(&encode_block(&block)).unwrap();
    assert_eq!(replica.balance("bob").unwrap(), 25);

    let mut flipped = block.clone();
    flipped.header.proposer_signature[0] ^= 0xff;
    let fresh = common::node();
    assert_eq!(
        fresh.import_block(&encode_block(&flipped)).unwrap_err(),
        ChainError::BadProposerSignature
    );
    let mut mislabeled = block;
    mislabeled.header.proposer = "validator-b".into();
    common::sign(&mut mislabeled);
    assert_eq!(
        fresh.import_block(&encode_block(&mislabeled)).unwrap_err(),
        ChainError::BadProposerSignature
    );
    assert_eq!(fresh.height().unwrap(), 0);
    assert_eq!(fresh.balance("bob").unwrap(), 0);
    assert_eq!(fresh.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(fresh.supply().unwrap(), GENESIS_SUPPLY);
}

#[test]
fn a_sibling_block_is_a_fork_and_the_first_tip_stays() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();

    let other = common::peer();
    other
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    let rival = other.propose_and_seal_block(TS).unwrap().block.unwrap();
    assert_eq!(rival.header.proposer, "validator-b");
    assert_eq!(rival.header.parent_hash, [0u8; 32]);
    assert_eq!(
        node.import_block(&encode_block(&rival)).unwrap_err(),
        ChainError::Fork
    );
    assert_eq!(
        node.import_block(&encode_block(&rival)).unwrap_err(),
        ChainError::Fork
    );
    assert_eq!(node.fork_count().unwrap(), 1);
    assert_eq!(node.height().unwrap(), 1);
    assert_eq!(node.tip().unwrap(), tip);
    assert_eq!(node.balance("bob").unwrap(), 25);
    assert_eq!(node.balance("carol").unwrap(), 0);
    assert_eq!(
        node.balance(GENESIS_ACCOUNT).unwrap(),
        GENESIS_SUPPLY - 25
    );
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);

    let mut detached = rival;
    detached.header.parent_hash = [9u8; 32];
    arkhe_chain::sign_proposer(&mut detached, &common::SECRET_B).unwrap();
    assert_eq!(
        node.import_block(&encode_block(&detached)).unwrap_err(),
        ChainError::ParentMismatch
    );
    assert_eq!(node.fork_count().unwrap(), 1);
    assert_eq!(node.tip().unwrap(), tip);
    assert_eq!(node.balance("bob").unwrap(), 25);
}

#[test]
fn two_of_three_equal_weights_stay_short_of_the_threshold() {
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
    let node = arkhe_chain::ArkheNode::new(
        "validator-a",
        &common::SECRET_A,
        validators,
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
            parts: 1,
            part_hash: tip,
            chain_id: arkhe_chain::CHAIN_ID.into(),
            block_hash: tip,
            signature: [0u8; 64],
        };
        arkhe_chain::sign_precommit(&mut vote, &secret).unwrap();
        node.note_precommit(&vote).unwrap();
    }
    assert_eq!(node.bft_commit(1).unwrap_err(), ChainError::QuorumAbsent);
    let mut third = arkhe_chain::Precommit {
        validator_id: "validator-c".into(),
        height: 1,
        round: 0,
        parts: 1,
        part_hash: tip,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: tip,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_precommit(&mut third, &secret_c).unwrap();
    node.note_precommit(&third).unwrap();
    node.bft_commit(1).unwrap();
    assert_eq!(node.tip().unwrap(), tip);
    assert_eq!(node.height().unwrap(), 1);
}

#[test]
fn only_the_highest_round_counts_toward_the_weight_threshold() {
    let node = common::node();
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
            parts: 1,
            part_hash: tip,
            chain_id: arkhe_chain::CHAIN_ID.into(),
            block_hash: tip,
            signature: [0u8; 64],
        };
        arkhe_chain::sign_precommit(&mut vote, &secret).unwrap();
        node.note_precommit(&vote).unwrap();
    }
    // Keep this height uncommitted while testing round replacement.

    let mut later = arkhe_chain::Precommit {
        validator_id: "validator-a".into(),
        height: 1,
        round: 1,
        parts: 1,
        part_hash: tip,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: tip,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_precommit(&mut later, &common::SECRET_A).unwrap();
    node.note_precommit(&later).unwrap();
    assert_eq!(node.precommit_count(1).unwrap(), 2);
    assert_eq!(node.precommit_round(1, "validator-a").unwrap(), Some(1));
    assert_eq!(node.precommit_round(1, "validator-b").unwrap(), Some(0));
    assert_eq!(node.bft_commit(1).unwrap_err(), ChainError::QuorumAbsent);

    later.round = 0;
    arkhe_chain::sign_precommit(&mut later, &common::SECRET_A).unwrap();
    assert_eq!(
        node.note_precommit(&later).unwrap_err(),
        ChainError::RoundRegression
    );
    assert_eq!(node.precommit_round(1, "validator-a").unwrap(), Some(1));

    later.validator_id = "validator-b".into();
    later.round = 1;
    arkhe_chain::sign_precommit(&mut later, &common::SECRET_B).unwrap();
    node.note_precommit(&later).unwrap();
    node.bft_commit(1).unwrap();
    assert_eq!(node.tip().unwrap(), tip);
    assert_eq!(node.height().unwrap(), 1);
    assert_eq!(
        node.finality(1).unwrap(),
        arkhe_chain::Finality { height: 1, depth: 0 }
    );
}

#[test]
fn a_precommit_must_name_one_part_equal_to_the_block_hash() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();
    let mut vote = arkhe_chain::Precommit {
        validator_id: "validator-a".into(),
        height: 1,
        round: 0,
        parts: 2,
        part_hash: tip,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        block_hash: tip,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_A).unwrap();
    assert_eq!(
        node.note_precommit(&vote).unwrap_err(),
        ChainError::BadPartSet
    );
    vote.parts = 1;
    vote.part_hash = [9u8; 32];
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_A).unwrap();
    assert_eq!(
        node.note_precommit(&vote).unwrap_err(),
        ChainError::BadPartSet
    );
    assert_eq!(node.precommit_count(1).unwrap(), 0);
    vote.part_hash = tip;
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_A).unwrap();
    node.note_precommit(&vote).unwrap();
    assert_eq!(node.precommit_count(1).unwrap(), 1);
    assert_eq!(node.tip().unwrap(), tip);
    assert_eq!(node.bft_commit(1).unwrap_err(), ChainError::QuorumAbsent);
}

#[test]
fn a_precommit_for_another_chain_is_refused() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let tip = node.tip().unwrap();
    let mut vote = arkhe_chain::Precommit {
        validator_id: "validator-a".into(),
        height: 1,
        round: 0,
        parts: 1,
        part_hash: tip,
        chain_id: "other-chain".into(),
        block_hash: tip,
        signature: [0u8; 64],
    };
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_A).unwrap();
    assert_eq!(node.note_precommit(&vote).unwrap_err(), ChainError::ChainId);
    vote.chain_id.clear();
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_A).unwrap();
    assert_eq!(node.note_precommit(&vote).unwrap_err(), ChainError::ChainId);
    assert_eq!(node.precommit_count(1).unwrap(), 0);
    vote.chain_id = arkhe_chain::CHAIN_ID.into();
    arkhe_chain::sign_precommit(&mut vote, &common::SECRET_A).unwrap();
    node.note_precommit(&vote).unwrap();
    assert_eq!(node.precommit_count(1).unwrap(), 1);
    assert_eq!(node.tip().unwrap(), tip);
    assert_eq!(node.height().unwrap(), 1);
}

#[test]
fn a_zero_value_transfer_keeps_balances_and_appends_a_leaf() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 0))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    assert_eq!(node.balance("bob").unwrap(), 0);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.mmr_count().unwrap(), 1);
    assert_eq!(node.height().unwrap(), 1);
    assert_eq!(node.mempool_len().unwrap(), 0);
}

#[test]
fn a_quorum_records_the_next_height_without_changing_the_tip() {
    let path = std::env::temp_dir().join(format!(
        "arkhe-chain-commit-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let node = arkhe_chain::ArkheNode::open(
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
    let first = node.tip().unwrap();
    node.ingest(common::transfer(1, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    node.propose_and_seal_block(TS + 1).unwrap();
    let tip = node.tip().unwrap();
    assert_eq!(node.committed_height().unwrap(), 0);
    assert!(std::fs::read(&path).unwrap().starts_with(b"AKGCHNS7"));
    sign_both(&node, 2, tip);
    assert_eq!(node.bft_commit(2).unwrap_err(), ChainError::CommitGap);
    assert_eq!(node.committed_height().unwrap(), 0);
    assert_eq!(node.tip().unwrap(), tip);
    sign_both(&node, 1, first);
    node.bft_commit(1).unwrap();
    assert_eq!(node.committed_height().unwrap(), 1);
    assert_eq!(node.tip().unwrap(), tip);
    assert!(std::fs::read(&path).unwrap().starts_with(b"AKGCHNS9"));
    node.bft_commit(1).unwrap();
    sign_both(&node, 2, tip);
    node.bft_commit(2).unwrap();
    assert_eq!(node.committed_height().unwrap(), 2);
    assert_eq!(node.tip().unwrap(), tip);
    assert_eq!(node.height().unwrap(), 2);
    assert_eq!(node.balance("bob").unwrap(), 26);
    drop(node);

    let again = arkhe_chain::ArkheNode::open(
        &path,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(again.committed_height().unwrap(), 2);
    assert_eq!(again.tip().unwrap(), tip);
    assert_eq!(again.height().unwrap(), 2);
    let _ = std::fs::remove_file(&path);
}

fn sign_both(node: &arkhe_chain::ArkheNode, height: u64, hash: [u8; 32]) {
    for (id, secret) in [
        ("validator-a", common::SECRET_A),
        ("validator-b", common::SECRET_B),
    ] {
        let mut vote = arkhe_chain::Precommit {
            validator_id: id.into(),
            height,
            round: 0,
            parts: 1,
            part_hash: hash,
            chain_id: arkhe_chain::CHAIN_ID.into(),
            block_hash: hash,
            signature: [0u8; 64],
        };
        arkhe_chain::sign_precommit(&mut vote, &secret).unwrap();
        node.note_precommit(&vote).unwrap();
    }
}
