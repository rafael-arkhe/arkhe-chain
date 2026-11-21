mod common;

use arkhe_chain::{
    check_shape, AbsentRpc, ChainError, Groth16Verifier, RejectingVerifier, RpcOutcome,
    SettleRequest, SettlementRpc, UndeployedVerifier, ValidityBridge, GENESIS_ACCOUNT,
    GENESIS_SUPPLY,
};

const TS: u64 = 1_700_000_000;

struct TimeoutRpc;
impl SettlementRpc for TimeoutRpc {
    fn settle(&self, _request: &SettleRequest<'_>) -> Result<RpcOutcome, ChainError> {
        Err(ChainError::RpcTimeout)
    }
}

struct UnavailableRpc;
impl SettlementRpc for UnavailableRpc {
    fn settle(&self, _request: &SettleRequest<'_>) -> Result<RpcOutcome, ChainError> {
        Err(ChainError::RpcUnavailable)
    }
}

struct ScriptedReceipt([u8; 32]);
impl SettlementRpc for ScriptedReceipt {
    fn settle(&self, request: &SettleRequest<'_>) -> Result<RpcOutcome, ChainError> {
        assert_eq!(request.seal.len(), 260);
        Ok(RpcOutcome::Mined { tx_hash: self.0 })
    }
}

struct Accepting;
impl Groth16Verifier for Accepting {
    fn verify(
        &self,
        selector: [u8; 4],
        seal: &[u8],
        anchor: &[u8; 37],
    ) -> Result<bool, ChainError> {
        check_shape(selector, seal, anchor)?;
        Ok(true)
    }
}

#[test]
fn absent_bridge_and_rpc_failures_do_not_invent_a_receipt() {
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
    let seal = &bound[76..336];
    let absent = ValidityBridge {
        evm_bridge_address: None,
    };
    assert_eq!(
        absent
            .submit_validity_proof(
                1,
                &header.state_root,
                bound[..4].try_into().unwrap(),
                seal,
                &UndeployedVerifier,
                &AbsentRpc,
            )
            .unwrap_err(),
        ChainError::VerifierAbsent
    );
    assert_eq!(
        node.relay_settlement(&bound, &absent, &UndeployedVerifier, &AbsentRpc)
            .unwrap_err(),
        ChainError::VerifierAbsent
    );
    let hold = node.settlement_contingency().unwrap().unwrap();
    assert!(!hold.settled);
    assert!(!hold.broadcast);
    assert!(hold.receipt.is_none());
    assert_eq!(&hold.anchor[..5], b"ARKHE");

    let bridge = ValidityBridge {
        evm_bridge_address: Some([0x11; 20]),
    };
    assert_eq!(
        node.relay_settlement(
            &bound,
            &bridge,
            &RejectingVerifier,
            &ScriptedReceipt([0xab; 32]),
        )
        .unwrap_err(),
        ChainError::ProofRejected
    );
    assert!(node
        .settlement_contingency()
        .unwrap()
        .unwrap()
        .receipt
        .is_none());
    assert_eq!(
        node.relay_settlement(&bound, &bridge, &Accepting, &AbsentRpc)
            .unwrap_err(),
        ChainError::RpcAbsent
    );
    assert_eq!(
        node.relay_settlement(&bound, &bridge, &Accepting, &TimeoutRpc)
            .unwrap_err(),
        ChainError::RpcTimeout
    );
    assert_eq!(
        node.relay_settlement(&bound, &bridge, &Accepting, &UnavailableRpc)
            .unwrap_err(),
        ChainError::RpcUnavailable
    );
    let held = node.settlement_contingency().unwrap().unwrap();
    assert!(!held.settled);
    assert!(held.receipt.is_none());
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
    assert_eq!(node.balance("bob").unwrap(), 7);

    let mut zero_seal = bound.clone();
    zero_seal[76..].fill(0);
    assert_eq!(
        node.relay_settlement(&zero_seal, &bridge, &Accepting, &TimeoutRpc)
            .unwrap_err(),
        ChainError::ProofRejected
    );
    assert!(node
        .settlement_contingency()
        .unwrap()
        .unwrap()
        .receipt
        .is_none());

    let scripted = [0xab; 32];
    let local = *blake3::hash(seal).as_bytes();
    assert_ne!(scripted, local);
    assert_eq!(
        node.relay_settlement(&bound, &bridge, &Accepting, &ScriptedReceipt(scripted))
            .unwrap(),
        scripted
    );
    let settled = node.settlement_contingency().unwrap().unwrap();
    assert!(settled.settled);
    assert!(!settled.broadcast);
    assert_eq!(settled.receipt, Some(scripted));
    assert_eq!(node.supply().unwrap(), GENESIS_SUPPLY);
}

fn proof(number: &[u8], root: &[u8; 32], parent: &[u8; 32]) -> Vec<u8> {
    let mut out = vec![0x73, 0xc4, 0x57, 0xba];
    out.extend_from_slice(number);
    out.extend_from_slice(root);
    out.extend_from_slice(parent);
    out.extend(std::iter::repeat_n(0x11, 260));
    out
}
