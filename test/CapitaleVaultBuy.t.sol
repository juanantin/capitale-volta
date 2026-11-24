// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {CapitaleVault, IMontraHook} from "../src/CapitaleVault.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";

/// Tax split, buy rules, rejection and pauses, ops payout, one token per city.
contract CapitaleVaultBuyTest is BaseTest {
    function setUp() public override {
        super.setUp();
        goPublic();
        build(alice, MILANO); // #1, earns LiquidV
    }

    function test_taxSplit70_15_15() public {
        payTax(1 ether);
        vault.settle();
        assertEq(vault.residentsFunds(), 0.7 ether);
        assertEq(vault.streetFunds(), 0.15 ether);
        assertEq(vault.opsFunds(), 0.15 ether);
        assertEq(vault.totalTax(), 1 ether);
    }

    function test_taxSplitNoDust(uint96 amount) public {
        payTax(amount);
        vault.settle();
        assertEq(vault.residentsFunds() + vault.streetFunds() + vault.opsFunds(), amount);
    }

    function test_lowGasCallCannotPauseBuying() public {
        payTax(1 ether);
        vm.expectRevert(CapitaleVault.NotEnoughGas.selector);
        vault.requestBuy{gas: 3_500_000}();
        assertEq(vault.pausedUntil(), 0);
        assertTrue(vault.requestBuy());
    }

    function test_payOpsAnyone() public {
        payTax(1 ether);
        vm.prank(bob);
        vault.payOps();
        assertEq(hype.balanceOf(opsSafe), 0.15 ether);
        assertEq(vault.opsFunds(), 0);
        vm.expectRevert(CapitaleVault.NothingToPay.selector);
        vault.payOps();
    }

    function test_buyBelowMinimumSkipped() public {
        payTax(0.1 ether); // 0.07 residents' share < 0.1 minimum (the street share waits for Sunday)
        assertFalse(vault.requestBuy());
        assertEq(vault.totalPurchases(), 0);
        payTax(0.1 ether); // 0.14
        assertTrue(vault.requestBuy());
        assertEq(vault.totalPurchases(), 1);
    }

    function test_buyCappedAtMaxOrderAndRemainderWaits() public {
        payTax(1 ether); // 0.7 residents' share
        vm.prank(bob); // anyone can trigger
        assertTrue(vault.requestBuy());
        assertEq(vault.residentsFunds(), 0.1 ether);
        assertEq(vault.streetFunds(), 0.15 ether); // waits for the deadline
        assertEq(rewards[LIQUIDV_IDX].balanceOf(address(vault)), fill(LIQUIDV_IDX, 0.6 ether));
        // Interval: next order no sooner than 10 minutes.
        vm.warp(block.timestamp + 10 minutes - 1);
        assertFalse(vault.requestBuy());
        vm.warp(block.timestamp + 1);
        assertTrue(vault.requestBuy());
        assertEq(vault.residentsFunds(), 0);
    }

    function test_residentsBoughtNowStreetAfterTheDeadline() public {
        payTax(0.2 ether); // 0.14 residents + 0.03 street
        assertTrue(vault.requestBuy());
        assertEq(vault.pending(1, LIQUIDV_IDX), fill(LIQUIDV_IDX, 0.14 ether));
        assertEq(vault.streetFunds(), 0.03 ether);
        vm.warp(FIRST_DEADLINE);
        vault.settle(); // Milano won the race: its prize waits to be bought in LiquidV
        assertEq(vault.streetFunds(), 0);
        assertEq(vault.cityStreetFunds(MILANO), 0.03 ether);
        assertFalse(vault.requestBuy()); // 0.03 alone is below the minimum order
        payTax(0.1 ether); // +0.07 residents: 0.1 to buy
        assertTrue(vault.requestBuy());
        assertEq(vault.cityStreetTotal(), 0);
        assertEq(vault.pending(1, LIQUIDV_IDX), fill(LIQUIDV_IDX, 0.24 ether));
        assertEq(vault.totalBoughtUsd(), 720e18); // 0.24 income * $3,000
    }

    function test_eachCityEarnsItsOwnToken() public {
        build(bob, ROMA); // #2 MONTRA
        build(carol, NAPOLI); // #3 CHAMELEON
        build(carol, VENEZIA); // #4 EACCAT
        build(carol, PALERMO); // #5 NUM
        payTax(0.25 ether); // 0.175 residents: 0.035 per building
        assertTrue(vault.requestBuy());
        uint8[5] memory earns = cityTokens();
        for (uint256 id = 1; id <= 5; ++id) {
            uint8 t = earns[id - 1]; // building #id is in city id - 1
            assertEq(vault.pending(id, t), fill(t, 0.035 ether));
            for (uint8 u; u < N_TOKENS; ++u) {
                if (u != t) assertEq(vault.pending(id, u), 0); // nothing in the other tokens
            }
            // Same value for every building: 0.035 income * $3,000.
            assertEq(vault.pendingUsd(id), 105e18);
        }
        assertEq(vault.totalPurchases(), 5); // five tokens bought in this order
        uint8[] memory ct = vault.cityTokens();
        assertEq(ct.length, 5);
        assertEq(ct[MILANO], LIQUIDV_IDX);
        assertEq(ct[ROMA], MONTRA_IDX);
        assertEq(ct[NAPOLI], CHAMELEON_IDX);
        assertEq(ct[VENEZIA], EACCAT_IDX);
        assertEq(ct[PALERMO], NUM_IDX);
    }

    function test_splitByBuildingCount() public {
        build(alice, MILANO); // Milano 2
        build(bob, ROMA); // Roma 1
        payTax(0.3 ether); // 0.21 residents: 0.14 Milano, 0.07 Roma
        assertTrue(vault.requestBuy());
        assertEq(vault.pending(1, LIQUIDV_IDX), fill(LIQUIDV_IDX, 0.07 ether));
        assertEq(vault.pending(2, LIQUIDV_IDX), fill(LIQUIDV_IDX, 0.07 ether));
        assertEq(vault.pending(3, MONTRA_IDX), fill(MONTRA_IDX, 0.07 ether));
        assertEq(vault.pendingUsd(1), vault.pendingUsd(3));
    }

    function test_rejectionKeepsIncomeAndPauses6h() public {
        payTax(1 ether);
        adapter.setQuality(9_500); // 5% worse than reference > 4% allowed
        vm.expectEmit(false, false, false, false, address(vault));
        emit CapitaleVault.BuyRejected(0, 0, 0, 0, "");
        assertFalse(vault.requestBuy());
        assertEq(vault.residentsFunds() + vault.streetFunds(), 0.85 ether);
        assertEq(vaultIncome(), 1 ether);
        assertEq(vault.pausedUntil(), block.timestamp + 6 hours);

        adapter.setQuality(10_000);
        vm.warp(block.timestamp + 6 hours - 1);
        assertFalse(vault.requestBuy());
        vm.warp(block.timestamp + 1);
        assertTrue(vault.requestBuy());
    }

    function test_oneBadTokenRejectsTheWholeOrder() public {
        build(bob, ROMA);
        payTax(1 ether);
        adapter.setQualityFor(address(rewards[LIQUIDV_IDX]), 9_500); // only the LiquidV swap fails
        assertFalse(vault.requestBuy());
        assertEq(vault.heldRewards(MONTRA_IDX), 0); // Roma's part was not bought either
        assertEq(vault.residentsFunds(), 0.7 ether);
    }

    function test_withinDeviationAccepted() public {
        payTax(1 ether);
        adapter.setQuality(9_601);
        assertTrue(vault.requestBuy());
    }

    function test_adapterIgnoringMinOutStillRejected() public {
        payTax(1 ether);
        adapter.setHonourMinOut(false);
        adapter.setQuality(5_000);
        assertFalse(vault.requestBuy());
        assertEq(rewards[LIQUIDV_IDX].balanceOf(address(vault)), 0);
        assertEq(vault.residentsFunds() + vault.streetFunds(), 0.85 ether);
    }

    function test_brokenOrMissingAdapterRejected() public {
        payTax(1 ether);
        adapter.setBroken(true);
        assertFalse(vault.requestBuy());
        vm.warp(block.timestamp + 6 hours);
        vm.prank(admin);
        vault.setAdapter(LIQUIDV_IDX, ISwapAdapter(address(0)));
        assertFalse(vault.requestBuy());
        assertEq(vaultIncome(), 1 ether);
    }

    function test_decimalsHandled() public {
        build(carol, VENEZIA); // EACCAT (test copy) has 6 decimals
        payTax(0.2 ether); // 0.07 per building
        assertTrue(vault.requestBuy());
        assertEq(rewards[EACCAT_IDX].balanceOf(address(vault)), fill(EACCAT_IDX, 0.07 ether));
        assertEq(fill(EACCAT_IDX, 0.07 ether), 105e6); // 0.07 * $3000 / $2
    }

    function test_sharedTokenConfig() public {
        // Two cities can share a token (set at deploy): here Napoli earns MONTRA like Roma.
        CapitaleVault v2 = deployVaultWith(
            allTokens(), allRoutes(), 5, IMontraHook(address(0)), [LIQUIDV_IDX, MONTRA_IDX, MONTRA_IDX, EACCAT_IDX, NUM_IDX]
        );
        vm.startPrank(address(nft));
        v2.onMint(1, ROMA, false);
        v2.onMint(2, NAPOLI, false);
        vm.stopPrank();
        hype.mint(address(v2), 0.2 ether);
        assertTrue(v2.requestBuy());
        assertEq(v2.totalPurchases(), 1); // one MONTRA swap for both cities
        assertEq(v2.pending(1, MONTRA_IDX), fill(MONTRA_IDX, 0.07 ether));
        assertEq(v2.pending(2, MONTRA_IDX), fill(MONTRA_IDX, 0.07 ether));
    }

    function test_badCityTokenRejected() public {
        IMontraHook noEscrow = IMontraHook(address(0));
        vm.expectRevert(CapitaleVault.BadToken.selector);
        deployVaultWith(allTokens(), allRoutes(), 5, noEscrow, [LIQUIDV_IDX, MONTRA_IDX, 5, EACCAT_IDX, NUM_IDX]);
        // Cities beyond the deploy count are ignored.
        deployVaultWith(allTokens(), allRoutes(), 2, noEscrow, [LIQUIDV_IDX, MONTRA_IDX, 9, 9, 9]);
    }

    function test_noBuildingsResidentsFundsWait() public {
        CapitaleVault v2 = deployVault(allTokens(), allRoutes(), 5, IMontraHook(address(0)));
        hype.mint(address(v2), 1 ether);
        assertFalse(v2.requestBuy()); // nobody to receive them yet
        assertEq(v2.residentsFunds(), 0.7 ether);
    }

    function test_schedulerIdleAfter24hAndRestartedByRequest() public {
        assertTrue(vault.schedulerActive());
        vm.warp(block.timestamp + 24 hours + 1);
        assertFalse(vault.schedulerActive());
        vm.prank(carol);
        vault.requestBuy(); // nothing to buy, but restarts the scheduler
        assertTrue(vault.schedulerActive());
    }

    function test_executeBuyOnlySelf() public {
        vm.expectRevert(CapitaleVault.NotSelf.selector);
        vault.executeBuy(1, 1, 1, 0);
    }

    function test_refundedIncomeBecomesTax() public {
        payTax(1 ether);
        vault.settle();
        // Income sent directly (e.g. a router refund) is treated as new tax, never lost.
        payTax(0.1 ether);
        vault.settle();
        assertEq(vault.totalTax(), 1.1 ether);
    }
}
