use crate::error::ChainError;
use crate::tx::BlockHeader;

/// Domain of a citation from a sealed Arkhe block to an Ethereum execution block.
/// The citation is not a settlement and carries no Ethereum receipt.
pub const ETH_LINK_DOMAIN: &[u8] = b"AKG:ETH:LINK:v1\0";

/// Identifier of an Ethereum execution block, as supplied by the caller.
/// This crate does not fetch it and does not decide that Ethereum finalized it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EthereumExecutionId {
    pub number: u64,
    pub hash: [u8; 32],
}

/// A checked pairing of one sealed Arkhe block with one execution identifier.
/// `settled` is always false: the pairing does not move either chain.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EthereumLink {
    pub arkhe_height: u64,
    pub arkhe_block_hash: [u8; 32],
    pub state_root: [u8; 32],
    pub execution_number: u64,
    pub execution_hash: [u8; 32],
    pub commitment: [u8; 32],
    /// Always false. Confirmation does not settle either chain.
    pub settled: bool,
    /// True only on the value returned by a matching execution client.
    /// The snapshot does not store this bit.
    pub confirmed: bool,
}

pub fn ethereum_link_preimage(
    header: &BlockHeader,
    arkhe_block_hash: &[u8; 32],
    execution: EthereumExecutionId,
) -> Vec<u8> {
    let mut out = ETH_LINK_DOMAIN.to_vec();
    out.extend_from_slice(&header.block_number.to_be_bytes());
    out.extend_from_slice(arkhe_block_hash);
    out.extend_from_slice(&header.state_root);
    out.extend_from_slice(&execution.number.to_be_bytes());
    out.extend_from_slice(&execution.hash);
    out
}

pub fn ethereum_link_commitment(preimage: &[u8]) -> [u8; 32] {
    *blake3::hash(preimage).as_bytes()
}

pub fn ethereum_link(
    header: &BlockHeader,
    arkhe_block_hash: [u8; 32],
    execution: EthereumExecutionId,
) -> EthereumLink {
    let preimage = ethereum_link_preimage(header, &arkhe_block_hash, execution);
    EthereumLink {
        arkhe_height: header.block_number,
        arkhe_block_hash,
        state_root: header.state_root,
        execution_number: execution.number,
        execution_hash: execution.hash,
        commitment: ethereum_link_commitment(&preimage),
        settled: false,
        confirmed: false,
    }
}

/// Reads an Ethereum execution block hash. This crate does not open a socket.
pub trait ExecutionRpc {
    fn execution_hash(&self, number: u64) -> Result<[u8; 32], ChainError>;
}

/// No execution client is configured.
#[derive(Debug, Default, Clone, Copy)]
pub struct AbsentExecutionRpc;

impl ExecutionRpc for AbsentExecutionRpc {
    fn execution_hash(&self, _number: u64) -> Result<[u8; 32], ChainError> {
        Err(ChainError::RpcAbsent)
    }
}
