// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CapitaleVault, ICapitaleNFTView, IWETH} from "../src/CapitaleVault.sol";
import {ICapitaleOracle} from "../src/interfaces/ICapitaleOracle.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";

/// Weekly vote, transfer lock, street competition, lazy settlement and rollover, permissions.
contract CapitaleVaultWeeklyTest is BaseTest {
    function setUp() public override {
        super.setUp();
        goPublic();
    }

    function _streetBuy(uint256 tax) internal returns (uint256 streetTokens) {
        payTax(tax);
        vm.warp(block.timestamp + 10 minutes);
        require(vault.requestBuy(), "buy failed");
        streetTokens = vault.streetPool(vault.currentToken());
    }

    // ─────────── votes ───────────

    function test_firstDeadlineIsSunday20Rome() public view {
        assertEq(vault.weekEnd(), FIRST_DEADLINE);
    }

    function test_onePerBuildingPerWeek() public {
        build(alice, 0);
        build(alice, 1);
        vm.startPrank(alice);
        vault.vote(ids2(1, 2), 1);
        vm.expectRevert(abi.encodeWithSelector(CapitaleVault.AlreadyVoted.selector, 1));
        vault.vote(ids1(1), 0);
        vm.stopPrank();
        assertEq(vault.votesOf(0)[1], 2);
        assertEq(vault.votesOf(0).length, 2);
        assertTrue(vault.hasVoted(1));
        // Next week the building can vote again.
        vm.warp(FIRST_DEADLINE);
        vm.prank(alice);
        vault.vote(ids1(1), 0);
        assertEq(vault.votesOf(1)[0], 1);
    }

    function test_duplicateIdsInOneCallRejected() public {
        build(alice, 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CapitaleVault.AlreadyVoted.selector, 1));
        vault.vote(ids2(1, 1), 1);
    }

    function test_mayorAndNonOwnerCannotVote() public {
        build(alice, 0);
        vm.prank(mayor);
        vm.expectRevert(CapitaleVault.MayorExcluded.selector);
        vault.vote(ids1(0), 1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CapitaleVault.NotBuildingOwner.selector, 1));
        vault.vote(ids1(1), 1);
        vm.prank(alice);
        vm.expectRevert(CapitaleVault.BadToken.selector);
        vault.vote(ids1(1), 2); // only STOCKIFY (0) and STONKEX (1)
    }

    function test_voteAllSkipsVotedAndMayor() public {
        build(alice, 0);
        build(alice, 1);
        build(alice, 0);
        vm.prank(mayor);
        nft.transferFrom(mayor, alice, 0); // even holding the Mayor, it never votes
        vm.startPrank(alice);
        vault.vote(ids1(2), 0);
        assertEq(vault.voteAll(1), 2);
        assertEq(vault.voteAll(1), 0);
        vm.stopPrank();
        assertEq(vault.votesOf(0)[1], 2);
        assertEq(vault.votesOf(0)[0], 1);
    }

    function test_transferLockWithinWeek() public {
        build(alice, 0);
        vm.prank(alice);
        vault.vote(ids1(1), 1);
        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CapitaleVault.AlreadyVoted.selector, 1));
        vault.vote(ids1(1), 0);
        vm.prank(bob);
        assertEq(vault.voteAll(0), 0);
        vm.warp(FIRST_DEADLINE);
        vm.prank(bob);
        vault.vote(ids1(1), 0);
    }

    function test_mostVotesPicksNextWeekToken() public {
        build(alice, 0);
        build(alice, 0);
        build(bob, 1);
        vm.prank(alice);
        vault.voteAll(1); // 2 votes STONKEX
        vm.prank(bob);
        vault.voteAll(0); // 1 vote STOCKIFY
        assertEq(vault.currentToken(), 0); // unchanged until the deadline
        vm.warp(FIRST_DEADLINE - 1);
        vault.settle();
        assertEq(vault.currentToken(), 0);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        assertEq(vault.currentToken(), 1);
        assertEq(vault.week(), 1);
    }

    function test_tieOrNoVotesKeepsToken() public {
        build(alice, 0);
        build(bob, 0);
        vm.prank(alice);
        vault.voteAll(1);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        assertEq(vault.currentToken(), 1); // STONKEX won week 0
        vm.prank(alice);
        vault.voteAll(1);
        vm.prank(bob);
        vault.voteAll(0);
        vm.warp(vault.weekEnd());
        vault.settle();
        assertEq(vault.currentToken(), 1); // 1-1 tie: unchanged (not reset to the first token)
        vm.warp(vault.weekEnd());
        vault.settle();
        assertEq(vault.currentToken(), 1); // no votes: unchanged
    }

    // ─────────── street competition ───────────

    function test_districtWithMostNewBuildingsWins() public {
        build(alice, 0);
        build(alice, 1);
        build(bob, 1);
        uint256 pool = _streetBuy(0.2 ether);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        // Roma (1) built 2 this week vs Milano 1: Roma's two buildings split the street pool.
        uint256 res = vault.pending(1, 0); // Milano: residents share only
        assertEq(vault.pending(2, 0), res + pool / 2);
        assertEq(vault.pending(3, 0), res + pool / 2);
        assertEq(vault.streetPool(0), 0);
    }

    function test_onlyThisWeeksNewBuildingsCount() public {
        buildMany(alice, 1, 3); // Roma: 3 in week 0
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        build(bob, 0); // week 1: Milano 1 new, Roma 0 new
        uint256 pool = _streetBuy(0.2 ether);
        vm.warp(vault.weekEnd());
        vault.settle();
        uint256 res = vault.pending(1, 0);
        assertEq(vault.pending(4, 0), res + pool);
    }

    function test_tiedDistrictsShare() public {
        build(alice, 0);
        build(bob, 1);
        build(carol, 1); // Roma 2 new
        build(alice, 0); // Milano 2 new: a tie
        uint256 pool = _streetBuy(0.2 ether);
        uint256 res = vault.pending(1, 0); // residents' share, before the street pool
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        uint256 each = pool / 4; // 4 buildings across the two tied districts
        for (uint256 id = 1; id <= 4; ++id) {
            assertEq(vault.pending(id, 0), res + each);
        }
    }

    function test_nobodyBuiltAllBuiltDistrictsShare() public {
        build(alice, 0);
        build(bob, 1);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        uint256 pool = _streetBuy(0.2 ether); // week 1, nobody builds
        uint256 res = vault.pending(1, 0);
        vm.warp(vault.weekEnd());
        vault.settle();
        assertEq(vault.pending(1, 0), res + pool / 2);
        assertEq(vault.pending(2, 0), res + pool / 2);
    }

    function test_noResidentsStreetPoolRollsOver() public {
        uint256 pool = _streetBuy(0.2 ether);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        assertEq(vault.streetPool(0), pool);
        build(alice, 1);
        vm.warp(vault.weekEnd());
        vault.settle();
        assertEq(vault.streetPool(0), 0);
        assertEq(vault.pending(1, 0), pool); // residents' share of that buy waits in carry
    }

    function test_afterCityCompleteSharedCityWide() public {
        vm.warp(START);
        buildMany(alice, 0, 300);
        goPublic();
        buildMany(alice, 0, 2000);
        buildMany(bob, 1, 700);
        assertEq(vault.residents(), 3000);
        uint256 pool = _streetBuy(1 ether);
        uint256 before = vault.pending(3000, 0);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        // Milano had 2,300 new this week, but the competition is over: everybody shares.
        assertApproxEqAbs(vault.pending(3000, 0) - before, pool / 3000, 1);
        assertEq(vault.pending(1, 0), vault.pending(3000, 0)); // Milano == Roma
    }

    // ─────────── settlement ───────────

    function test_settleIsLazyOnVoteBuildBuyClaim() public {
        build(alice, 0);
        vm.warp(FIRST_DEADLINE);
        assertEq(vault.week(), 0);
        vm.prank(alice);
        vault.vote(ids1(1), 1);
        assertEq(vault.week(), 1);

        vm.warp(vault.weekEnd());
        build(bob, 1);
        assertEq(vault.week(), 2);

        vm.warp(vault.weekEnd());
        vault.requestBuy();
        assertEq(vault.week(), 3);

        vm.warp(vault.weekEnd());
        vm.prank(alice);
        vault.claim(1);
        assertEq(vault.week(), 4);
    }

    function test_settleCatchesUpManyWeeks() public {
        build(alice, 0);
        vm.warp(FIRST_DEADLINE + 10 weeks + 1 days);
        vm.prank(carol); // anyone
        vault.settle();
        assertEq(vault.week(), 11);
        assertGt(vault.weekEnd(), block.timestamp);
    }

    function test_unspentTaxRollsOver() public {
        build(alice, 0);
        payTax(0.05 ether); // below the minimum order all week
        vault.settle();
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        assertEq(vault.residentsEth() + vault.streetEth(), 0.0425 ether);
        payTax(0.1 ether);
        assertTrue(vault.requestBuy());
        assertEq(vault.residentsEth() + vault.streetEth(), 0);
    }

    // ─────────── permissions ───────────

    function test_adminFunctionsOnlyOwner() public {
        bytes memory err = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice);
        vm.startPrank(alice);
        vm.expectRevert(err);
        vault.setOracle(ICapitaleOracle(address(1)));
        vm.expectRevert(err);
        vault.setAdapter(0, ISwapAdapter(address(1)));
        vm.expectRevert(err);
        vault.setBuyParams(defaultParams());
        vm.expectRevert(err);
        vault.setOps(alice);
        vm.stopPrank();
    }

    function test_vaultDistrictCountBounds() public {
        assertEq(vault.districts(), 2);
        IERC20[] memory none = new IERC20[](0);
        ISwapAdapter[] memory noRoutes = new ISwapAdapter[](0);
        vm.expectRevert(CapitaleVault.BadConfig.selector);
        new CapitaleVault(admin, ICapitaleNFTView(address(nft)), 0, none, noRoutes, ICapitaleOracle(address(oracle)), opsSafe, IWETH(address(0)), 0, defaultParams());
        // One token but no swap route for it.
        IERC20[] memory one = new IERC20[](1);
        one[0] = IERC20(address(rewards[0]));
        vm.expectRevert(CapitaleVault.BadConfig.selector);
        new CapitaleVault(admin, ICapitaleNFTView(address(nft)), 0, one, noRoutes, ICapitaleOracle(address(oracle)), opsSafe, IWETH(address(0)), 0, defaultParams());
    }

    function test_onMintOnlyNft() public {
        vm.expectRevert(CapitaleVault.NotNft.selector);
        vault.onMint(5, 0, false);
    }

    function test_badBuyParamsRejected() public {
        CapitaleVault.BuyParams memory p = defaultParams();
        p.maxDeviationBps = 2_000;
        vm.prank(admin);
        vm.expectRevert(CapitaleVault.BadConfig.selector);
        vault.setBuyParams(p);
        p = defaultParams();
        p.maxOrder = 0.01 ether;
        vm.prank(admin);
        vm.expectRevert(CapitaleVault.BadConfig.selector);
        vault.setBuyParams(p);
    }

    function test_ownerCannotTakeFunds() public {
        // The owner's only levers are config; a malicious adapter still cannot get ETH out
        // because a fill below the oracle reference is rejected and the ETH stays.
        build(alice, 0);
        payTax(1 ether);
        adapter.setHonourMinOut(false);
        adapter.setQuality(0);
        vm.prank(admin);
        vault.requestBuy();
        assertEq(address(vault).balance, 1 ether);
    }
}
