use crate::ChainError;

pub const PHASE0_SELECTOR: [u8; 4] = [0x73, 0xc4, 0x57, 0xba];
pub const SEAL_LEN: usize = 260;

pub fn check_shape(selector: [u8; 4], seal: &[u8], anchor: &[u8; 37]) -> Result<(), ChainError> {
    if selector != PHASE0_SELECTOR {
        return Err(ChainError::InvalidSelector);
    }
    if seal.len() != SEAL_LEN {
        return Err(ChainError::InvalidSealLength {
            expected: SEAL_LEN,
            got: seal.len(),
        });
    }
    if &anchor[..5] != b"ARKHE" {
        return Err(ChainError::InvalidAnchorPrefix);
    }
    Ok(())
}

pub trait Groth16Verifier {
    fn verify(&self, selector: [u8; 4], seal: &[u8], anchor: &[u8; 37])
        -> Result<bool, ChainError>;
}

/// No verifier contract is deployed.
#[derive(Debug, Default, Clone, Copy)]
pub struct UndeployedVerifier;

impl Groth16Verifier for UndeployedVerifier {
    fn verify(
        &self,
        _selector: [u8; 4],
        _seal: &[u8],
        _anchor: &[u8; 37],
    ) -> Result<bool, ChainError> {
        Err(ChainError::VerifierAbsent)
    }
}

/// Deployed stand-in for `Groth16Verifier.sol`: shape is checked, then the
/// proof is rejected. Pairing is not executed.
#[derive(Debug, Default, Clone, Copy)]
pub struct RejectingVerifier;

impl Groth16Verifier for RejectingVerifier {
    fn verify(
        &self,
        selector: [u8; 4],
        seal: &[u8],
        anchor: &[u8; 37],
    ) -> Result<bool, ChainError> {
        check_shape(selector, seal, anchor)?;
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AbsentRpc, RpcOutcome, SettlementRpc, ValidityBridge};

    struct FlagVerifier {
        pass: bool,
    }

    impl Groth16Verifier for FlagVerifier {
        fn verify(
            &self,
            selector: [u8; 4],
            seal: &[u8],
            anchor: &[u8; 37],
        ) -> Result<bool, ChainError> {
            check_shape(selector, seal, anchor)?;
            Ok(self.pass)
        }
    }

    struct Receipt([u8; 32]);

    impl SettlementRpc for Receipt {
        fn settle(&self, request: &crate::SettleRequest<'_>) -> Result<RpcOutcome, ChainError> {
            let _ = request;
            Ok(RpcOutcome::Mined { tx_hash: self.0 })
        }
    }

    #[test]
    fn test_submit_proof_fails_closed_when_verifier_absent() {
        let verifier = UndeployedVerifier;
        let mock_seal = vec![0u8; 260];
        let mock_anchor = [0u8; 37];
        let result = verifier.verify(PHASE0_SELECTOR, &mock_seal, &mock_anchor);
        assert_eq!(result, Err(ChainError::VerifierAbsent));
    }

    #[test]
    fn test_submit_proof_rejects_bad_shape() {
        let verifier = RejectingVerifier;
        let seal = vec![0xffu8; 260];
        let mut anchor = [0u8; 37];
        anchor[..5].copy_from_slice(b"ARKHE");
        assert_eq!(
            verifier.verify([0, 0, 0, 1], &seal, &anchor),
            Err(ChainError::InvalidSelector)
        );
        assert_eq!(
            verifier.verify(PHASE0_SELECTOR, &[0xff; 10], &anchor),
            Err(ChainError::InvalidSealLength {
                expected: 260,
                got: 10
            })
        );
        assert_eq!(
            verifier.verify(PHASE0_SELECTOR, &seal, &[0u8; 37]),
            Err(ChainError::InvalidAnchorPrefix)
        );
    }

    #[test]
    fn test_submit_proof_succeeds_with_valid_260b_seal() {
        let verifier = FlagVerifier { pass: true };
        let mock_seal = vec![0xffu8; 260];
        let mut mock_anchor = [0u8; 37];
        mock_anchor[..5].copy_from_slice(b"ARKHE");
        assert_eq!(
            verifier.verify(PHASE0_SELECTOR, &mock_seal, &mock_anchor),
            Ok(true)
        );

        let bridge = ValidityBridge {
            evm_bridge_address: Some([0x22; 20]),
        };
        let root = [0x44; 32];
        assert_eq!(
            bridge
                .submit_validity_proof(
                    1,
                    &root,
                    PHASE0_SELECTOR,
                    &mock_seal,
                    &verifier,
                    &AbsentRpc,
                )
                .unwrap_err(),
            ChainError::RpcAbsent
        );
        let scripted = [0xab; 32];
        assert_ne!(scripted, *blake3::hash(&mock_seal).as_bytes());
        assert_eq!(
            bridge
                .submit_validity_proof(
                    1,
                    &root,
                    PHASE0_SELECTOR,
                    &mock_seal,
                    &verifier,
                    &Receipt(scripted),
                )
                .unwrap(),
            scripted
        );
        assert_eq!(
            bridge
                .submit_validity_proof(
                    1,
                    &root,
                    PHASE0_SELECTOR,
                    &mock_seal,
                    &FlagVerifier { pass: false },
                    &Receipt(scripted),
                )
                .unwrap_err(),
            ChainError::ProofRejected
        );
    }
}
