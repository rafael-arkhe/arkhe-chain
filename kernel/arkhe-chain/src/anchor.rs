use crate::error::ChainError;

pub const BTC_OP_RETURN_LEN: usize = 37;
const PREFIX: &[u8; 5] = b"ARKHE";

pub fn btc_op_return(state_root: &[u8; 32]) -> [u8; 37] {
    let mut out = [0u8; BTC_OP_RETURN_LEN];
    out[..5].copy_from_slice(PREFIX);
    out[5..].copy_from_slice(state_root);
    out
}

/// Accept only this crate's anchor: 37 bytes, `ARKHE` followed by `state_root`.
/// Any other length or prefix is rejected. This does not broadcast.
pub fn check_btc_op_return(bytes: &[u8], state_root: &[u8; 32]) -> Result<[u8; 37], ChainError> {
    let expected = btc_op_return(state_root);
    if bytes != expected {
        return Err(ChainError::InvalidAnchorPrefix);
    }
    Ok(expected)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnchorPlan {
    pub op_return: [u8; 37],
    pub evm_contract_address: String,
    /// This process did not broadcast the payload.
    pub broadcast: bool,
}

#[derive(Debug, Clone)]
pub struct AnchorPublisher {
    pub evm_contract_address: String,
}

impl AnchorPublisher {
    pub fn plan(&self, state_root: &[u8; 32]) -> Result<AnchorPlan, ChainError> {
        if !evm_address(&self.evm_contract_address) {
            return Err(ChainError::AnchorAddress);
        }
        let op_return = check_btc_op_return(&btc_op_return(state_root), state_root)?;
        Ok(AnchorPlan {
            op_return,
            evm_contract_address: self.evm_contract_address.clone(),
            broadcast: false,
        })
    }
}

fn evm_address(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("0x") else {
        return false;
    };
    rest.len() == 40 && rest.bytes().all(|b| b.is_ascii_hexdigit())
}
