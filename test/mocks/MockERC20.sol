// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mintable test token; `paused` makes every transfer revert (a "paused asset").
contract MockERC20 is ERC20 {
    uint8 private immutable _dec;
    bool public paused;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function setPaused(bool p) external {
        paused = p;
    }

    // Montra-style holder rewards: paid in another asset, claimed by the holder itself.
    MockERC20 public rewardAsset;
    mapping(address => uint256) public rewardOwed;

    function setRewardAsset(MockERC20 a) external {
        rewardAsset = a;
    }

    function accrueReward(address holder, uint256 amount) external {
        rewardAsset.mint(address(this), amount);
        rewardOwed[holder] += amount;
    }

    function claimRewards() external returns (uint256 amount) {
        require(address(rewardAsset) != address(0), "no rewards");
        amount = rewardOwed[msg.sender];
        rewardOwed[msg.sender] = 0;
        if (amount != 0) rewardAsset.transfer(msg.sender, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!paused, "paused");
        super._update(from, to, value);
    }
}
