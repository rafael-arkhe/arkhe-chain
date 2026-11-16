//! C1 falsifiers: sibling stays `Fork`, quorum and `canonical_commit_verdict` do not
//! replace the canonical tip. There is no live tip-reorg policy in this crate.

mod common;

use arkhe_chain::{
    encode_block, sign_precommit, ArkheNode, ChainError, CommitVerdict, Precommit, Validator,
    CHAIN_ID, GENESIS_ACCOUNT,
};

const TS: u64 = 1_700_000_000;
const IDS: [&str; 4] = ["val1", "val2", "val3", "val4"];

fn secret(index: usize) -> [u8; 32] {
    [0xA1 + index as u8; 32]
}

fn validators() -> Vec<Validator> {
    (0..4)
        .map(|index| Validator {
            id: IDS[index].to_string(),
            public_key: arkhe_chain::public_key(&secret(index)).unwrap(),
        })
        .collect()
}

fn node(index: usize) -> ArkheNode {
    ArkheNode::new(IDS[index], &secret(index), validators(), common::accounts()).unwrap()
}

fn vote(index: usize, height: u64, hash: [u8; 32]) -> Precommit {
    let mut vote = Precommit {
        validator_id: IDS[index].to_string(),
        height,
        round: 0,
        block_hash: hash,
        parts: 1,
        part_hash: hash,
        chain_id: CHAIN_ID.to_string(),
        signature: [0u8; 64],
    };
    sign_precommit(&mut vote, &secret(index)).unwrap();
    vote
}

fn seal(sealer: &ArkheNode, nonce: u64, recipient: &str, timestamp: u64) -> (Vec<u8>, [u8; 32]) {
    sealer
        .ingest(common::transfer(nonce, GENESIS_ACCOUNT, recipient, 5))
        .unwrap();
    let block = sealer
        .propose_and_seal_block(timestamp)
        .unwrap()
        .block
        .unwrap();
    (encode_block(&block), sealer.tip().unwrap())
}

#[test]
fn c1_sibling_import_records_fork_and_keeps_tip() {
    let (canonical, sibling) = (node(0), node(1));
    let (block_a, hash_a) = seal(&canonical, 0, "bob", TS);
    let (block_b, hash_b) = seal(&sibling, 0, "carol", TS);
    assert_ne!(hash_a, hash_b);

    let observer = node(2);
    observer.import_block(&block_a).unwrap();
    assert_eq!(observer.import_block(&block_b), Err(ChainError::Fork));
    assert_eq!(
        (observer.tip().unwrap(), observer.fork_count().unwrap()),
        (hash_a, 1)
    );
    assert_eq!(observer.block_hash_at(1).unwrap(), hash_a);
}

#[test]
fn c1_precommits_on_sibling_are_not_stored() {
    let (canonical, sibling, observer) = (node(0), node(1), node(2));
    let (block_a, hash_a) = seal(&canonical, 0, "bob", TS);
    let (block_b, hash_b) = seal(&sibling, 0, "carol", TS);
    observer.import_block(&block_a).unwrap();
    assert_eq!(observer.import_block(&block_b), Err(ChainError::Fork));

    for index in 0..4 {
        assert_eq!(
            observer.note_precommit(&vote(index, 1, hash_b)),
            Err(ChainError::Fork)
        );
    }
    assert_eq!(observer.precommit_count(1).unwrap(), 0);
    assert_eq!(observer.tip().unwrap(), hash_a);
    assert!(matches!(
        observer.canonical_commit_verdict(1).unwrap(),
        CommitVerdict::QuorumAbsent { .. }
    ));
}

#[test]
fn c1_quorum_on_canonical_advances_commit_not_tip_replace_on_sibling() {
    let (canonical, sibling, observer) = (node(0), node(1), node(2));
    let (block_a, hash_a) = seal(&canonical, 0, "bob", TS);
    let (block_b, hash_b) = seal(&sibling, 0, "carol", TS);
    observer.import_block(&block_a).unwrap();
    assert_eq!(observer.import_block(&block_b), Err(ChainError::Fork));

    for index in 0..3 {
        observer.note_precommit(&vote(index, 1, hash_a)).unwrap();
    }
    let verdict = observer.canonical_commit_verdict(1).unwrap();
    assert!(matches!(
        verdict,
        CommitVerdict::Commit {
            height: 1,
            block_id,
            ..
        } if block_id == hash_a
    ));
    observer.bft_commit(1).unwrap();
    assert_eq!(observer.committed_height().unwrap(), 1);

    assert_eq!(observer.import_block(&block_b), Err(ChainError::Fork));
    assert_eq!(
        (observer.tip().unwrap(), observer.block_hash_at(1).unwrap()),
        (hash_a, hash_a)
    );
    assert_ne!(observer.tip().unwrap(), hash_b);
}

#[test]
fn c1_longer_competing_chain_does_not_replace_committed_tip() {
    let (canonical, sibling, observer) = (node(0), node(1), node(2));
    let (block_a, hash_a) = seal(&canonical, 0, "bob", TS);
    let (_, hash_b1) = seal(&sibling, 0, "carol", TS);
    let (block_b2, _) = seal(&sibling, 1, "carol", TS + 1);

    observer.import_block(&block_a).unwrap();
    for index in 0..3 {
        observer.note_precommit(&vote(index, 1, hash_a)).unwrap();
    }
    observer.bft_commit(1).unwrap();

    assert_eq!(observer.import_block(&block_b2), Err(ChainError::ParentMismatch));
    assert_eq!(
        (observer.height().unwrap(), observer.tip().unwrap()),
        (1, hash_a)
    );
    assert_ne!(hash_b1, hash_a);
}

#[test]
fn c1_canonical_commit_verdict_ignores_hypothetical_sibling_quorum() {
    let observer = node(2);
    let (block_a, hash_a) = seal(&node(0), 0, "bob", TS);
    let (block_b, hash_b) = seal(&node(1), 0, "carol", TS);
    observer.import_block(&block_a).unwrap();
    assert_eq!(observer.import_block(&block_b), Err(ChainError::Fork));

    for index in 0..3 {
        observer.note_precommit(&vote(index, 1, hash_a)).unwrap();
    }
    let verdict = observer.canonical_commit_verdict(1).unwrap();
    assert!(matches!(
        verdict,
        CommitVerdict::Commit { block_id, .. } if block_id == hash_a
    ));
    assert_ne!(hash_a, hash_b);
    assert_eq!(observer.tip().unwrap(), hash_a);
}