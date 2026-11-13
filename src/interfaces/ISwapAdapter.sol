// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A whitelisted route that turns the vault's income into one reward token.
///         Native income arrives as msg.value (tokenIn == address(0)); ERC-20 income is pulled
///         with transferFrom up to `amountIn` (the vault approves exactly that, then resets it).
///         The adapter must deliver at least `minOut` of `tokenOut` to `recipient` or revert.
interface ISwapAdapter {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address recipient)
        external
        payable
        returns (uint256 amountOut);
}
