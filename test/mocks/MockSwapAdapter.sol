// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapAdapter} from "../../src/interfaces/ISwapAdapter.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Takes the income token and fills tokenOut at `oracle price * qualityBps / 10000` by
///         minting it. qualityBps < 10000 simulates a worse execution price.
contract MockSwapAdapter is ISwapAdapter {
    uint256 public incomeUsd; // 1e18 per whole income token
    mapping(address => uint256) public tokenUsd; // 1e18 per whole token
    uint256 public qualityBps = 10_000;
    bool public honourMinOut = true;
    bool public broken;
    bool public takeMore; // tries to pull more income than approved

    function setPrices(uint256 incomeUsd_, address token, uint256 tokenUsd_) external {
        incomeUsd = incomeUsd_;
        tokenUsd[token] = tokenUsd_;
    }

    function setQuality(uint256 q) external {
        qualityBps = q;
    }

    /// Per-token execution quality (0 = use qualityBps).
    mapping(address => uint256) public qualityFor;

    function setQualityFor(address token, uint256 q) external {
        qualityFor[token] = q;
    }

    function setHonourMinOut(bool h) external {
        honourMinOut = h;
    }

    function setBroken(bool b) external {
        broken = b;
    }

    function setTakeMore(bool b) external {
        takeMore = b;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address recipient)
        external
        payable
        returns (uint256 out)
    {
        require(!broken, "broken");
        uint8 dIn = 18;
        if (tokenIn == address(0)) {
            require(msg.value == amountIn, "value");
        } else {
            IERC20(tokenIn).transferFrom(msg.sender, address(this), takeMore ? amountIn + 1 : amountIn);
            dIn = MockERC20(tokenIn).decimals();
        }
        uint8 d = MockERC20(tokenOut).decimals();
        out = (amountIn * incomeUsd * (10 ** d)) / (tokenUsd[tokenOut] * (10 ** dIn));
        uint256 q = qualityFor[tokenOut] != 0 ? qualityFor[tokenOut] : qualityBps;
        out = (out * q) / 10_000;
        if (honourMinOut) require(out >= minOut, "slippage");
        MockERC20(tokenOut).mint(recipient, out);
    }
}
