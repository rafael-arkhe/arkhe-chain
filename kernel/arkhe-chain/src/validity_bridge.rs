use crate::proof_verification::{check_shape, Groth16Verifier};
use crate::{btc_op_return, check_btc_op_return, ChainError};

/// Bridge address on an EVM chain. `None` and the zero address are absent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidityBridge {
    pub evm_bridge_address: Option<[u8; 20]>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettleRequest<'a> {
    pub bridge: [u8; 20],
    pub block_number: u64,
    pub state_root: [u8; 32],
    pub seal: &'a [u8],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RpcOutcome {
    Reverted(ChainError),
    /// Hash taken from a node receipt. This crate does not derive it.
    Mined {
        tx_hash: [u8; 32],
    },
}

pub trait SettlementRpc {
    fn settle(&self, request: &SettleRequest<'_>) -> Result<RpcOutcome, ChainError>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct AbsentRpc;

impl SettlementRpc for AbsentRpc {
    fn settle(&self, _request: &SettleRequest<'_>) -> Result<RpcOutcome, ChainError> {
        Err(ChainError::RpcAbsent)
    }
}

impl ValidityBridge {
    pub fn submit_validity_proof<V: Groth16Verifier, R: SettlementRpc>(
        &self,
        block_number: u64,
        state_root: &[u8; 32],
        selector: [u8; 4],
        seal: &[u8],
        verifier: &V,
        rpc: &R,
    ) -> Result<[u8; 32], ChainError> {
        let bridge = self
            .evm_bridge_address
            .filter(|addr| *addr != [0u8; 20])
            .ok_or(ChainError::VerifierAbsent)?;
        if block_number == 0 || *state_root == [0u8; 32] || seal.iter().all(|byte| *byte == 0) {
            return Err(ChainError::ProofRejected);
        }
        let anchor = check_btc_op_return(&btc_op_return(state_root), state_root)?;
        match verifier.verify(selector, seal, &anchor)? {
            false => return Err(ChainError::ProofRejected),
            true => check_shape(selector, seal, &anchor)?,
        }
        match rpc.settle(&SettleRequest {
            bridge,
            block_number,
            state_root: *state_root,
            seal,
        })? {
            RpcOutcome::Reverted(error) => Err(error),
            RpcOutcome::Mined { tx_hash } if tx_hash == [0u8; 32] => {
                Err(ChainError::RpcUnavailable)
            }
            RpcOutcome::Mined { tx_hash } => Ok(tx_hash),
        }
    }
}
