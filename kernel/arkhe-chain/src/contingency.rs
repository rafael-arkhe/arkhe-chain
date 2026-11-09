use crate::{btc_op_return, check_btc_op_return, ChainError, ProofJournal};

/// Local hold opened when a bound journal has no Groth16 verifier.
/// The anchor stays in memory and nothing is settled.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettlementContingency {
    pub target_block_number: u64,
    pub claimed_root: [u8; 32],
    pub anchor: [u8; 37],
    pub broadcast: bool,
    pub settled: bool,
    pub receipt: Option<[u8; 32]>,
}

pub fn hold_for_absent_verifier(
    journal: &ProofJournal,
) -> Result<SettlementContingency, ChainError> {
    if journal.target_block_number == 0 || journal.claimed_root == [0u8; 32] {
        return Err(ChainError::ProofRejected);
    }
    Ok(SettlementContingency {
        target_block_number: journal.target_block_number,
        claimed_root: journal.claimed_root,
        anchor: check_btc_op_return(&btc_op_return(&journal.claimed_root), &journal.claimed_root)?,
        broadcast: false,
        settled: false,
        receipt: None,
    })
}
