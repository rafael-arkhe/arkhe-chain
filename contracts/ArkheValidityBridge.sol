// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[2] calldata input
    ) external view returns (bool);
}

/// Settlement entry. With no verifier address the call reverts `VerifierAbsent`.
/// The transaction hash of a mined call is assigned by the client, not computed here.
contract ArkheValidityBridge {
    address public zkVerifier;
    address public immutable governance;
    mapping(uint256 => bytes32) public settledBlocks;

    event BlockSettled(uint256 indexed blockNumber, bytes32 indexed stateRoot);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    error VerifierAbsent();
    error InvalidValidityProof();
    error BlockAlreadySettled(uint256 blockNumber);
    error Unauthorized();

    modifier onlyGovernance() {
        if (msg.sender != governance) revert Unauthorized();
        _;
    }

    constructor(address _governance) {
        if (_governance == address(0)) revert Unauthorized();
        governance = _governance;
    }

    function setVerifier(address newVerifier) external onlyGovernance {
        emit VerifierUpdated(zkVerifier, newVerifier);
        zkVerifier = newVerifier;
    }

    function settleBlockWithProof(
        uint256 blockNumber,
        bytes32 stateRoot,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[2] calldata input
    ) external {
        if (zkVerifier == address(0)) revert VerifierAbsent();
        if (blockNumber == 0 || stateRoot == bytes32(0)) revert InvalidValidityProof();
        if (settledBlocks[blockNumber] != bytes32(0)) revert BlockAlreadySettled(blockNumber);
        if (bytes32(input[0]) != stateRoot || input[1] != blockNumber) {
            revert InvalidValidityProof();
        }
        if (!IGroth16Verifier(zkVerifier).verifyProof(a, b, c, input)) {
            revert InvalidValidityProof();
        }
        settledBlocks[blockNumber] = stateRoot;
        emit BlockSettled(blockNumber, stateRoot);
    }
}
