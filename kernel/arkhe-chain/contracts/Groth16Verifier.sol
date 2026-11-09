// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// Pairing check for the Phase 0 image is not in this contract.
/// Every call returns false. A verifying key has not been embedded.
contract Groth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[2] calldata input
    ) external pure returns (bool) {
        if (a[0] == 0 && b[0][0] == 0 && c[0] == 0 && input[0] == 0 && input[1] == 0) {
            return false;
        }
        return false;
    }
}
