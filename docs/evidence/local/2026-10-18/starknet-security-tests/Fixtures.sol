// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Local fixtures only; none is a production deployment or an in-scope finding.
interface IMinter { function mintRequest(address token, uint256 amount) external; }
contract TestToken {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failMint;
    bool public failTransfer;
    function setFailMint(bool value) external { failMint = value; }
    function setFailTransfer(bool value) external { failTransfer = value; }
    function mint(address recipient, uint256 amount) external {
        require(!failMint, "FIXTURE_MINT_FAILED");
        totalSupply += amount; balanceOf[recipient] += amount;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount; return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(!failTransfer, "FIXTURE_TRANSFER_FAILED");
        require(balanceOf[msg.sender] >= amount, "FIXTURE_BALANCE");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "FIXTURE_ALLOWANCE");
        require(balanceOf[from] >= amount, "FIXTURE_BALANCE");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount; balanceOf[to] += amount; return true;
    }
}
contract TestMessaging {
    mapping(bytes32 => uint256) public l2ToL1Messages;
    uint256 public sent;
    uint256 public lastDestination;
    uint256 public lastSupply;
    bool public failSend;
    function seed(uint256 from, address to, uint256 amount, uint256 count) external {
        l2ToL1Messages[keccak256(abi.encodePacked(from, uint256(uint160(to)), uint256(1), amount))] = count;
    }
    function seedPayload(uint256 from, address to, uint256[] calldata payload, uint256 count) external {
        l2ToL1Messages[keccak256(abi.encodePacked(from, uint256(uint160(to)), payload.length, payload))] = count;
    }
    function setFailSend(bool value) external { failSend = value; }
    function consumeMessageFromL2(uint256 from, uint256[] calldata payload) external returns (bytes32 h) {
        h = keccak256(abi.encodePacked(from, uint256(uint160(msg.sender)), payload.length, payload));
        require(l2ToL1Messages[h] > 0, "FIXTURE_NO_MESSAGE");
        l2ToL1Messages[h]--;
    }
    function sendMessageToL2(uint256 to, uint256, uint256[] calldata payload) external payable returns (bytes32, uint256) {
        require(!failSend, "FIXTURE_SEND_FAILED");
        sent++; lastDestination = to; lastSupply = payload[0]; return (bytes32(sent), sent);
    }
}
contract TestBridge {
    bool public failDeposit;
    uint256 public deposited;
    uint256 public lastRecipient;
    function setFailDeposit(bool value) external { failDeposit = value; }
    function depositWithMessage(address token, uint256 amount, uint256 recipient, uint256[] calldata) external payable {
        require(!failDeposit, "FIXTURE_BRIDGE_FAILED");
        require(TestToken(token).transferFrom(msg.sender, address(this), amount));
        deposited += amount; lastRecipient = recipient;
    }
}
contract TestProxy {
    address immutable implementation;
    constructor(address target, bytes memory data) {
        implementation = target;
        (bool ok, bytes memory reason) = target.delegatecall(abi.encodeWithSignature("initialize(bytes)", data));
        if (!ok) assembly { revert(add(reason, 32), mload(reason)) }
    }
    fallback() external payable {
        require(msg.sig != bytes4(keccak256("initialize(bytes)")), "FIXTURE_INIT_BLOCKED");
        address target = implementation;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok case 0 { revert(0, returndatasize()) } default { return(0, returndatasize()) }
        }
    }
}
