// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// One registry per Arkhe tenant/stream. Stores digests; never verifies Arkhe evidence.
contract AnchorRegistry {
    address public immutable owner;
    bytes32 public immutable streamId;
    uint256 public latestLeafCount;
    mapping(uint256 => bytes32) public checkpointDigests;
    event Anchored(bytes32 indexed checkpointDigest, uint256 indexed leafCount);

    constructor(bytes32 stream) { owner = msg.sender; streamId = stream; }
    function anchor(bytes32 checkpointDigest, uint256 leafCount) external {
        require(msg.sender == owner, "unauthorized");
        require(checkpointDigest != bytes32(0) && leafCount > 0, "empty checkpoint");
        bytes32 existing = checkpointDigests[leafCount];
        if (existing != bytes32(0)) {
            require(existing == checkpointDigest, "checkpoint conflict");
            return;
        }
        require(leafCount > latestLeafCount, "non-monotonic checkpoint");
        checkpointDigests[leafCount] = checkpointDigest;
        latestLeafCount = leafCount;
        emit Anchored(checkpointDigest, leafCount);
    }
}
