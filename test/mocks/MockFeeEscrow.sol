// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Minimal stand-in for Volta's FeeEscrow: credits a recipient, who withdraws later.
contract MockFeeEscrow {
    mapping(address => mapping(address => uint256)) public balances;

    function credit(MockERC20 token, address recipient, uint256 amount) external {
        token.mint(address(this), amount);
        balances[recipient][address(token)] += amount;
    }

    function withdrawFees(address token, address recipient, bool) external {
        uint256 amt = balances[msg.sender][token];
        balances[msg.sender][token] = 0;
        if (amt != 0) IERC20(token).transfer(recipient, amt);
    }
}
