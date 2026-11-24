// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {CapitaleVault} from "../src/CapitaleVault.sol";

/// Dividends, early-bird pool, claims (incl. a failing token), height levels.
contract CapitaleVaultRewardsTest is BaseTest {
    function _buy(uint256 eth) internal {
        payTax(eth);
        vm.warp(block.timestamp + 10 minutes);
        require(vault.requestBuy(), "buy failed");
    }

    /// Tokens the residents' 70% of `tax` buys when it all goes to one city on token `t`.
    function _residentsOut(uint8 t, uint256 tax) internal view returns (uint256) {
        return fill(t, tax * 7000 / 10_000);
    }

    function test_splitEquallyAmongExistingBuildings() public {
        goPublic();
        build(alice, MILANO);
        build(bob, MILANO);
        _buy(0.2 ether);
        uint256 res = _residentsOut(LIQUIDV_IDX, 0.2 ether);
        assertEq(vault.pending(1, LIQUIDV_IDX), res / 2);
        assertEq(vault.pending(2, LIQUIDV_IDX), res / 2);
        // A later building gets nothing from earlier purchases.
        build(carol, 0);
        assertEq(vault.pending(3, LIQUIDV_IDX), 0);
        _buy(0.2 ether);
        assertEq(vault.pending(3, LIQUIDV_IDX), res / 3);
        assertApproxEqAbs(vault.pending(1, LIQUIDV_IDX), res / 2 + res / 3, 1);
    }

    function test_fiveCitiesSameValueOwnToken() public {
        goPublic();
        for (uint8 d; d < N_CITIES; ++d) {
            build(alice, d); // #d+1 in city d
        }
        _buy(0.25 ether);
        uint8[5] memory earns = cityTokens();
        for (uint256 id = 1; id <= 5; ++id) {
            assertEq(vault.pending(id, earns[id - 1]), fill(earns[id - 1], 0.035 ether));
            assertEq(vault.pendingUsd(id), vault.pendingUsd(1));
        }
        uint256[] memory p = vault.pendingAll(3);
        assertEq(p.length, 5);
        assertGt(p[CHAMELEON_IDX], 0);
        assertEq(p[MONTRA_IDX] + p[LIQUIDV_IDX] + p[EACCAT_IDX] + p[NUM_IDX], 0);
    }

    function test_mayorGetsNothing() public {
        goPublic();
        build(alice, 0);
        _buy(0.2 ether);
        assertEq(vault.pending(0, LIQUIDV_IDX), 0);
        vm.prank(mayor);
        vm.expectRevert(CapitaleVault.MayorExcluded.selector);
        vault.claim(0);
    }

    function test_noBuildingsFundsWait() public {
        goPublic();
        payTax(0.2 ether);
        vm.warp(block.timestamp + 10 minutes);
        assertFalse(vault.requestBuy()); // nobody to receive them: the income waits
        build(alice, MILANO);
        _buy(0.2 ether);
        assertEq(vault.pending(1, LIQUIDV_IDX), _residentsOut(LIQUIDV_IDX, 0.4 ether));
    }

    function test_earlyBirdPoolPerCity() public {
        vm.warp(START);
        build(alice, MILANO); // early bird
        build(bob, ROMA); // early bird
        _buy(0.2 ether); // during early bird: each city's part goes to its early-bird pool
        assertEq(vault.earlyBirdPool(MILANO, LIQUIDV_IDX), fill(LIQUIDV_IDX, 0.07 ether));
        assertEq(vault.earlyBirdPool(ROMA, MONTRA_IDX), fill(MONTRA_IDX, 0.07 ether));
        assertEq(vault.pending(1, LIQUIDV_IDX), 0);

        goPublic();
        build(carol, MILANO); // not early bird, built after the window: settles the pools first
        assertTrue(vault.earlyBirdFinalized());
        assertEq(vault.pending(1, LIQUIDV_IDX), fill(LIQUIDV_IDX, 0.07 ether));
        assertEq(vault.pending(2, MONTRA_IDX), fill(MONTRA_IDX, 0.07 ether));
        assertEq(vault.pending(3, LIQUIDV_IDX), 0);
    }

    function test_laterEarlyBirdsShareThePool() public {
        vm.warp(START);
        build(alice, MILANO);
        _buy(0.2 ether); // bought while alice was the only early bird
        build(bob, MILANO); // still early bird: shares the pool when the window closes
        goPublic();
        vault.settle();
        uint256 res = _residentsOut(LIQUIDV_IDX, 0.2 ether);
        assertEq(vault.pending(1, LIQUIDV_IDX), res / 2);
        assertEq(vault.pending(2, LIQUIDV_IDX), res / 2);
    }

    function test_claimManyPaysEveryToken() public {
        goPublic();
        for (uint8 d; d < N_CITIES; ++d) {
            build(alice, d);
        }
        _buy(0.25 ether);
        uint256[] memory ids = new uint256[](5);
        uint256[5] memory owed;
        uint8[5] memory earns = cityTokens();
        for (uint256 id = 1; id <= 5; ++id) {
            ids[id - 1] = id;
            owed[earns[id - 1]] = vault.pending(id, earns[id - 1]);
        }
        vm.prank(alice);
        vault.claimMany(ids);
        for (uint8 t; t < N_TOKENS; ++t) {
            assertGt(owed[t], 0);
            assertEq(rewards[t].balanceOf(alice), owed[t]);
        }
        for (uint256 id = 1; id <= 5; ++id) {
            assertEq(vault.pendingUsd(id), 0);
        }
    }

    function test_claimSkipsFailingTokenAndKeepsItClaimable() public {
        goPublic();
        build(alice, MILANO); // LiquidV
        build(alice, ROMA); // MONTRA
        _buy(0.2 ether);
        uint256 pL = vault.pending(1, LIQUIDV_IDX);
        uint256 pM = vault.pending(2, MONTRA_IDX);

        rewards[LIQUIDV_IDX].setPaused(true);
        vm.prank(alice);
        vault.claimMany(ids2(1, 2));
        assertEq(rewards[LIQUIDV_IDX].balanceOf(alice), 0);
        assertEq(rewards[MONTRA_IDX].balanceOf(alice), pM);
        assertEq(vault.pending(1, LIQUIDV_IDX), pL); // still claimable

        rewards[LIQUIDV_IDX].setPaused(false);
        vm.prank(alice);
        vault.claim(1);
        assertEq(rewards[LIQUIDV_IDX].balanceOf(alice), pL);
    }

    function test_claimManyAndOwnership() public {
        goPublic();
        build(alice, MILANO);
        build(alice, MILANO);
        build(bob, MILANO);
        _buy(0.2 ether);
        uint256 each = vault.pending(1, LIQUIDV_IDX);
        vm.prank(alice);
        vault.claimMany(ids2(1, 2));
        assertEq(rewards[LIQUIDV_IDX].balanceOf(alice), 2 * each);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CapitaleVault.NotBuildingOwner.selector, 3));
        vault.claim(3);
    }

    function test_rewardsFollowTheNft() public {
        goPublic();
        build(alice, 0);
        _buy(0.2 ether);
        uint256 p = vault.pending(1, LIQUIDV_IDX);
        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CapitaleVault.NotBuildingOwner.selector, 1));
        vault.claim(1);
        vm.prank(bob);
        vault.claim(1);
        assertEq(rewards[LIQUIDV_IDX].balanceOf(bob), p);
    }

    function test_pendingUsdAtPurchaseTimeValue() public {
        goPublic();
        build(alice, 0);
        _buy(0.2 ether); // residents' 0.14 income * $3000 = $420
        uint256 expected = 420e18;
        assertEq(vault.pendingUsd(1), expected);
        // Later price moves do not change purchase-time value.
        oracle.setTokenUsd(address(rewards[LIQUIDV_IDX]), 5e18);
        assertApproxEqAbs(vault.pendingUsd(1), expected, 1);
    }

    function test_levels() public view {
        assertEq(vault.levelForUsd(0), 1);
        assertEq(vault.levelForUsd(5e18 - 1), 1);
        assertEq(vault.levelForUsd(5e18), 2);
        assertEq(vault.levelForUsd(20e18), 3);
        assertEq(vault.levelForUsd(50e18), 4);
        assertEq(vault.levelForUsd(100e18), 5);
        assertEq(vault.levelForUsd(150e18 - 1), 5);
        assertEq(vault.levelForUsd(150e18), 6);
        assertEq(vault.levelForUsd(1_100e18), 25);
    }

    function test_heightGrowsWithClaimsAndFollowsNft() public {
        goPublic();
        build(alice, 0);
        _buy(0.2 ether); // ~$420 to the only building
        assertEq(vault.levelOf(1), 1); // pending does not count, only claimed
        vm.prank(alice);
        vault.claim(1);
        uint256 usd = vault.claimedUsd(1);
        assertApproxEqAbs(usd, 420e18, 1);
        assertEq(vault.levelOf(1), 5 + (usd - 100e18) / 50e18);
        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        assertEq(vault.levelOf(1), 5 + (usd - 100e18) / 50e18);
    }

    function testFuzz_dividendsNeverExceedPurchases(uint8 nBuildings, uint96 tax) public {
        goPublic();
        nBuildings = uint8(bound(nBuildings, 1, 40));
        tax = uint96(bound(tax, 0.2 ether, 50 ether));
        for (uint256 i; i < nBuildings; ++i) {
            build(i % 2 == 0 ? alice : bob, uint8(i % 4));
        }
        payTax(tax);
        vm.warp(vault.weekEnd());
        vault.settle(); // the street prize goes to the winners too
        for (uint256 k; k < 200 && vault.residentsFunds() + vault.cityStreetTotal() >= 0.1 ether; ++k) {
            vm.warp(block.timestamp + 10 minutes);
            vault.requestBuy();
        }
        for (uint8 t; t < 3; ++t) {
            uint256 sum;
            for (uint256 id = 1; id <= nBuildings; ++id) {
                sum += vault.pending(id, t);
            }
            assertLe(sum + vault.carry(t), vault.heldRewards(t));
            // Only rounding dust stays behind (a few wei per order).
            assertApproxEqAbs(sum + vault.carry(t), vault.heldRewards(t), 2_000);
            assertLe(vault.carry(t), 2_000);
        }
    }
}
