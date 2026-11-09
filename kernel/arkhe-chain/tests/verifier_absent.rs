mod common;

use arkhe_chain::{ChainError, GENESIS_ACCOUNT};

const TS: u64 = 1_700_000_000;

#[test]
fn submit_never_returns_a_settlement_hash() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 7))
        .unwrap();
    node.propose_and_seal_block(TS).unwrap();
    let header = node.header_at(1).unwrap();
    let bound = proof(
        &header.block_number.to_be_bytes(),
        &header.state_root,
        &header.parent_hash,
    );

    let absent = node.submit_proof_and_bridge_assets(&bound).unwrap_err();
    assert_eq!(absent, ChainError::VerifierAbsent);
    assert_eq!(absent.to_string(), "FAIL_CLOSED: VERIFIER_ABSENT");

    let zero_number = proof(&0u64.to_be_bytes(), &header.state_root, &header.parent_hash);
    let zero_root = proof(
        &header.block_number.to_be_bytes(),
        &[0u8; 32],
        &header.parent_hash,
    );
    let cases: [&[u8]; 4] = [&[], &bound[..4], &zero_number, &zero_root];
    for proof in cases {
        let error = node.submit_proof_and_bridge_assets(proof).unwrap_err();
        assert_eq!(error, ChainError::ProofRejected);
        assert_ne!(error, ChainError::VerifierAbsent);
    }
    assert_eq!(node.balance("bob").unwrap(), 7);
}

fn proof(number: &[u8], root: &[u8; 32], parent: &[u8; 32]) -> Vec<u8> {
    let mut out = vec![0x73, 0xc4, 0x57, 0xba];
    out.extend_from_slice(number);
    out.extend_from_slice(root);
    out.extend_from_slice(parent);
    out.extend(std::iter::repeat(0u8).take(260));
    out
}
