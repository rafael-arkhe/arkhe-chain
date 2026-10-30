// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "src/solidity/StarknetTokenBridge.sol";
// Constructor-only fixture initialization. Original withdrawal and role methods are not overridden.
contract LocalStarkgate is StarknetTokenBridge {
    constructor(address messages, uint256 l2Bridge) {
        messagingContract(messages);
        setManager(address(this));
        WithdrawalLimit.setWithdrawLimitPct(WithdrawalLimit.DEFAULT_WITHDRAW_LIMIT_PCT);
        l2TokenBridge(l2Bridge);
    }
}
