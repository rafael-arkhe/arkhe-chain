mod common;

use arkhe_chain::{ChainError, GENESIS_ACCOUNT, GENESIS_SUPPLY};

const TS: u64 = 1_700_000_000;

#[test]
fn verifier_absent_opens_a_local_hold_and_does_not_settle() {
    let node = common::node();
    let before = node.supply().unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 7))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let header = node.header_at(1).unwrap();
    let bound = proof(
        &header.block_number.to_be_bytes(),
        &header.state_root,
        &header.parent_hash,
    );

    let hold = node.open_settlement_contingency(&bound).unwrap();
    assert_eq!(hold.target_block_number, 1);
    assert_eq!(hold.claimed_root, header.state_root);
    assert_eq!(&hold.anchor[..5], b"ARKHE");
    assert_eq!(&hold.anchor[5..], &header.state_root);
    assert!(!hold.broadcast);
    assert!(!hold.settled);
    assert_eq!(node.settlement_contingency().unwrap().as_ref(), Some(&hold));
    assert_eq!(
        node.submit_proof_and_bridge_assets(&bound).unwrap_err(),
        ChainError::VerifierAbsent
    );
    assert_eq!(node.balance("bob").unwrap(), 7);
    assert_eq!(node.balance(GENESIS_ACCOUNT).unwrap(), GENESIS_SUPPLY - 7);
    assert_eq!(node.supply().unwrap(), before);
    assert_eq!(node.height().unwrap(), 1);

    let rejected = node.open_settlement_contingency(&bound[..4]).unwrap_err();
    assert_eq!(rejected, ChainError::ProofRejected);
    assert_eq!(node.settlement_contingency().unwrap().as_ref(), Some(&hold));
}

fn proof(number: &[u8], root: &[u8; 32], parent: &[u8; 32]) -> Vec<u8> {
    let mut out = vec![0x73, 0xc4, 0x57, 0xba];
    out.extend_from_slice(number);
    out.extend_from_slice(root);
    out.extend_from_slice(parent);
    out.extend(std::iter::repeat_n(0u8, 260));
    out
}
