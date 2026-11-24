// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Minimal stand-in for Montra's LaunchHook: books creator-side fees per pool, in the
///         pool's quote (an ERC-20 or native HYPE), for the pool's recipient to claim.
contract MockMontraHook {
    mapping(bytes32 => uint256) public tab;
    mapping(bytes32 => address) public recipient;
    mapping(bytes32 => address) public quote; // address(0) = native

    error NotRecipient();

    function setRecipient(bytes32 poolId, address r, address quote_) external {
        recipient[poolId] = r;
        quote[poolId] = quote_;
    }

    /// ERC-20 quote: mints the fees here. Native quote: send them as msg.value.
    function book(bytes32 poolId, uint256 amount) external payable {
        address q = quote[poolId];
        if (q == address(0)) require(msg.value == amount, "value");
        else MockERC20(q).mint(address(this), amount);
        tab[poolId] += amount;
    }

    function claim(bytes32 poolId, address to) external returns (uint256 amount) {
        if (msg.sender != recipient[poolId]) revert NotRecipient();
        amount = tab[poolId];
        tab[poolId] = 0;
        if (amount == 0) return 0;
        address q = quote[poolId];
        if (q == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "send");
        } else {
            IERC20(q).transfer(to, amount);
        }
    }
}
