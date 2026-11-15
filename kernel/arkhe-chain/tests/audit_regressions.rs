mod common;

use arkhe_chain::{ArkheNode, ChainError, Precommit, GENESIS_ACCOUNT};
use arkhe_core::decision::DecisionVerdict;
use arkhe_core::{CanonicalEncode, Digest32};

const TIMESTAMP: u64 = 1_700_000_000;

fn open(path: &std::path::Path) -> Result<ArkheNode, ChainError> {
    ArkheNode::open(
        path,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
}

fn vote(node: &ArkheNode, id: &str, secret: &[u8; 32], height: u64, round: u64) {
    let hash = node.block_hash_at(height).unwrap();
    let mut vote = Precommit {
        validator_id: id.into(),
        height,
        round,
        block_hash: hash,
        parts: 1,
        part_hash: hash,
        chain_id: arkhe_chain::CHAIN_ID.into(),
        signature: [0; 64],
    };
    arkhe_chain::sign_precommit(&mut vote, secret).unwrap();
    node.note_precommit(&vote).unwrap();
}

#[test]
fn fabricated_policy_metadata_is_refused_in_ingest_and_import() {
    let producer = common::node();
    let original = common::transfer(0, GENESIS_ACCOUNT, "bob", 7);
    producer.ingest(original.clone()).unwrap();
    let block = producer
        .propose_and_seal_block(TIMESTAMP)
        .unwrap()
        .block
        .unwrap();

    for field in ["policy_id", "policy_digest", "event_type", "rule_id"] {
        let mut forged = original.clone();
        let mut verdict = DecisionVerdict::from_canonical_bytes(&forged.payload).unwrap();
        match field {
            "policy_id" => verdict.policy_id = "invented-policy".into(),
            "policy_digest" => verdict.policy_digest = Some(Digest32([0xa5; 32])),
            "event_type" => verdict.event_type = "invented-event".into(),
            "rule_id" => verdict.rule_id = Some("invented-rule".into()),
            _ => unreachable!(),
        }
        forged.payload = verdict.canonical_bytes();
        // Even the sender's endorsement cannot authorize an unknown policy.
        arkhe_chain::sign_sender(&mut forged, &common::GENESIS_SECRET).unwrap();
        let receiver = common::node();
        assert_eq!(
            receiver.ingest(forged.clone()),
            Err(ChainError::Admission("policy"))
        );
        let mut forged_block = block.clone();
        forged_block.transactions[0] = forged;
        common::sign(&mut forged_block);
        assert_eq!(
            receiver.import_block(&arkhe_chain::encode_block(&forged_block)),
            Err(ChainError::Admission("policy"))
        );
        assert_eq!(receiver.height().unwrap(), 0);
        assert_eq!(receiver.mempool_len().unwrap(), 0);
        assert_eq!(receiver.balance("bob").unwrap(), 0);
    }
}

#[test]
fn a_claimed_commit_without_votes_is_refused_without_rewriting() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("chain");
    let node = open(&path).unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    node.propose_and_seal_block(TIMESTAMP).unwrap();
    drop(node);

    let mut bytes = std::fs::read(&path).unwrap();
    assert_eq!(&bytes[..8], b"AKGCHNS7");
    bytes[..8].copy_from_slice(b"AKGCHNS9");
    let trailer = bytes.len() - 32;
    bytes.splice(trailer..trailer, 1u64.to_be_bytes());
    std::fs::write(&path, &bytes).unwrap();
    assert!(matches!(open(&path), Err(ChainError::Snapshot)));
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
}

#[test]
fn advancing_a_claimed_commit_past_its_certificate_is_refused() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("chain");
    let node = open(&path).unwrap();
    for nonce in 0..2 {
        node.ingest(common::transfer(nonce, GENESIS_ACCOUNT, "bob", 1))
            .unwrap();
        node.propose_and_seal_block(TIMESTAMP + nonce).unwrap();
    }
    vote(&node, "validator-a", &common::SECRET_A, 1, 0);
    vote(&node, "validator-b", &common::SECRET_B, 1, 0);
    node.bft_commit(1).unwrap();
    drop(node);
    let mut bytes = std::fs::read(&path).unwrap();
    let offset = bytes.len() - 32 - 8;
    bytes[offset..offset + 8].copy_from_slice(&2u64.to_be_bytes());
    std::fs::write(&path, &bytes).unwrap();
    assert!(matches!(open(&path), Err(ChainError::Snapshot)));
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
}

#[test]
fn a_later_round_preserves_the_committed_certificate_across_restart() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("chain");
    let node = open(&path).unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    node.propose_and_seal_block(TIMESTAMP).unwrap();
    vote(&node, "validator-a", &common::SECRET_A, 1, 0);
    vote(&node, "validator-b", &common::SECRET_B, 1, 0);
    node.bft_commit(1).unwrap();
    vote(&node, "validator-a", &common::SECRET_A, 1, 1);
    assert_eq!(node.precommit_round(1, "validator-a").unwrap(), Some(0));
    drop(node);
    let reopened = open(&path).unwrap();
    assert_eq!(reopened.committed_height().unwrap(), 1);
    assert_eq!(reopened.balance("bob").unwrap(), 1);
}

#[test]
fn more_than_one_thousand_distinct_votes_persist_and_reopen() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("chain");
    let keys: Vec<_> = (0u32..1001)
        .map(|index| {
            let mut secret = [0x99; 32];
            secret[..4].copy_from_slice(&index.to_be_bytes());
            (format!("validator-{index:04}"), secret)
        })
        .collect();
    let validators: Vec<_> = keys
        .iter()
        .map(|(id, secret)| arkhe_chain::Validator {
            id: id.clone(),
            public_key: arkhe_chain::public_key(secret).unwrap(),
        })
        .collect();
    let node = ArkheNode::open(
        &path,
        &keys[0].0,
        &keys[0].1,
        validators.clone(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
    node.propose_and_seal_block(TIMESTAMP).unwrap();
    for (id, secret) in &keys {
        vote(&node, id, secret, 1, 0);
    }
    assert_eq!(node.precommit_count(1).unwrap(), 1001);
    node.bft_commit(1).unwrap();
    drop(node);
    let reopened = ArkheNode::open(
        &path,
        &keys[0].0,
        &keys[0].1,
        validators,
        common::accounts(),
    )
    .unwrap();
    assert_eq!(reopened.precommit_count(1).unwrap(), 1001);
    assert_eq!(reopened.committed_height().unwrap(), 1);
}

#[test]
fn a_stale_temporary_file_cannot_be_followed_or_truncated() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("chain");
    let node = open(&path).unwrap();
    let previous = std::fs::read(&path).unwrap();
    let temporary = path.with_extension("arkhe-tmp");
    std::fs::write(&temporary, b"preserve me").unwrap();
    assert_eq!(
        node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1)),
        Err(ChainError::Snapshot)
    );
    assert_eq!(std::fs::read(&path).unwrap(), previous);
    assert_eq!(std::fs::read(&temporary).unwrap(), b"preserve me");
    assert_eq!(node.mempool_len().unwrap(), 0);
    std::fs::remove_file(temporary).unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 1))
        .unwrap();
}
