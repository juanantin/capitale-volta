// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Stand-in for Volta's creator NFT (one per launch, receives the creator fee share).
contract MockCreatorNFT is ERC721 {
    constructor() ERC721("Volta Creator", "CREATOR") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}
