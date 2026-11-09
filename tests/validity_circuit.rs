mod common;

use arkhe_chain::{load_circuit, AnchorPublisher, ChainError, GENESIS_ACCOUNT};

const TS: u64 = 1_700_000_000;

#[test]
fn circuit_file_pins_phase0_slash_verifier() {
    let circuit = load_circuit().unwrap();
    assert_eq!(circuit.phase, 0);
    assert_eq!(circuit.verifier.selector_hex, "73c457ba");
    assert_eq!(circuit.verifier.seal_bytes, 260);
    assert_eq!(circuit.verifier.max_gas, 276_000);
    assert_eq!(circuit.verifier.chain, "base-sepolia");
    assert_eq!(
        circuit
            .public_inputs
            .iter()
            .map(|input| input.name.as_str())
            .collect::<Vec<_>>(),
        ["target_block_number", "claimed_root", "parent_hash"]
    );
}

#[test]
fn proof_must_bind_the_sealed_root_and_is_not_broadcast() {
    let node = common::node();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 7))
        .unwrap();
    let block = node.propose_and_seal_block(TS).unwrap().block.unwrap();
    let header = node.header_at(1).unwrap();
    assert_eq!(header.state_root, block.header.state_root);

    let bound = proof(
        &header.block_number.to_be_bytes(),
        &header.state_root,
        &header.parent_hash,
    );
    assert_eq!(
        node.submit_proof_and_bridge_assets(&bound).unwrap_err(),
        ChainError::VerifierAbsent
    );

    let mut wrong_root = header.state_root;
    wrong_root[0] ^= 0x01;
    let unbound = proof(
        &header.block_number.to_be_bytes(),
        &wrong_root,
        &header.parent_hash,
    );
    assert_eq!(
        node.submit_proof_and_bridge_assets(&unbound).unwrap_err(),
        ChainError::ProofRejected
    );
    assert_eq!(
        node.submit_proof_and_bridge_assets(&[0x73, 0xc4, 0x57, 0xba])
            .unwrap_err(),
        ChainError::ProofRejected
    );

    let plan = AnchorPublisher {
        evm_contract_address: "0x1111111111111111111111111111111111111111".into(),
    }
    .plan(&header.state_root)
    .unwrap();
    assert!(!plan.broadcast);
    assert_eq!(&plan.op_return[..5], b"ARKHE");
    assert_eq!(&plan.op_return[5..], &header.state_root);
    assert_eq!(plan.op_return.len(), 37);
    let encoded = arkhe_chain::encode_block(&block);
    assert!(encoded.len() < arkhe_chain::MLDSA65_SIG_LEN);
    assert!(!encoded.windows(4).any(|window| window == b"ARKH"));
}

#[test]
fn the_anchor_must_be_arkhe_plus_the_state_root_and_is_not_broadcast() {
    let root = [0xab; 32];
    let plan = AnchorPublisher {
        evm_contract_address: "0x1111111111111111111111111111111111111111".into(),
    }
    .plan(&root)
    .unwrap();
    assert!(!plan.broadcast);
    assert_eq!(
        arkhe_chain::check_btc_op_return(&plan.op_return, &root).unwrap(),
        plan.op_return
    );
    assert_eq!(&plan.op_return[..5], b"ARKHE");
    assert_eq!(&plan.op_return[5..], &root);

    let mut wrong_root = plan.op_return;
    wrong_root[5] ^= 0x01;
    assert_eq!(
        arkhe_chain::check_btc_op_return(&wrong_root, &root).unwrap_err(),
        ChainError::InvalidAnchorPrefix
    );
    let mut wrong_prefix = plan.op_return;
    wrong_prefix[0] = b'X';
    assert_eq!(
        arkhe_chain::check_btc_op_return(&wrong_prefix, &root).unwrap_err(),
        ChainError::InvalidAnchorPrefix
    );
    let foreign = vec![0u8; 77];
    assert_eq!(
        arkhe_chain::check_btc_op_return(&foreign, &root).unwrap_err(),
        ChainError::InvalidAnchorPrefix
    );
}

fn proof(number: &[u8], root: &[u8; 32], parent: &[u8; 32]) -> Vec<u8> {
    let mut out = vec![0x73, 0xc4, 0x57, 0xba];
    out.extend_from_slice(number);
    out.extend_from_slice(root);
    out.extend_from_slice(parent);
    out.extend(std::iter::repeat(0u8).take(260));
    out
}
