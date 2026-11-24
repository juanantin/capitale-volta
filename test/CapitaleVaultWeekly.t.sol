// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CapitaleVault, IMontraHook} from "../src/CapitaleVault.sol";
import {ICapitaleOracle} from "../src/interfaces/ICapitaleOracle.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";

/// Weekly deadline, street competition, lazy settlement and rollover, permissions.
contract CapitaleVaultWeeklyTest is BaseTest {
    function setUp() public override {
        super.setUp();
        goPublic();
    }

    /// Pays `tax` now; its 15% street share waits for the deadline.
    function _payStreet(uint256 tax) internal {
        payTax(tax);
        vault.settle();
    }

    // ─────────── week ───────────

    function test_firstDeadlineIsSunday20Rome() public view {
        assertEq(vault.weekEnd(), FIRST_DEADLINE);
    }

    // ─────────── street competition ───────────

    function test_districtWithMostNewBuildingsWins() public {
        build(alice, MILANO);
        build(alice, ROMA);
        build(bob, ROMA);
        _payStreet(0.2 ether);
        assertEq(vault.streetFunds(), 0.03 ether);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        // Roma built 2 this week vs Milano 1: Roma wins the whole street share.
        assertEq(vault.cityStreetFunds(ROMA), 0.03 ether);
        assertEq(vault.cityStreetFunds(MILANO), 0);
        assertEq(vault.streetFunds(), 0);
        // The next order buys it in Roma's token (MONTRA) for Roma's two buildings, on top of
        // the residents' share (0.14 split by count: 1/3 Milano, 2/3 Roma).
        assertTrue(vault.requestBuy());
        assertApproxEqRel(vault.pending(2, MONTRA_IDX), fill(MONTRA_IDX, 0.015 ether + uint256(0.14 ether) / 3), 1e9);
        assertEq(vault.pending(2, MONTRA_IDX), vault.pending(3, MONTRA_IDX));
        assertApproxEqAbs(vault.pending(1, LIQUIDV_IDX), fill(LIQUIDV_IDX, uint256(0.14 ether) / 3), 6);
    }

    function test_streetPrizeBoughtInWinnersToken() public {
        build(alice, VENEZIA);
        _payStreet(0.2 ether);
        vm.warp(FIRST_DEADLINE);
        assertTrue(vault.requestBuy()); // settles, then buys residents' 0.14 + the 0.03 prize
        assertEq(vault.pending(1, EACCAT_IDX), fill(EACCAT_IDX, 0.17 ether));
        assertEq(vault.cityStreetTotal(), 0);
    }

    function test_onlyThisWeeksNewBuildingsCount() public {
        buildMany(alice, ROMA, 3); // Roma: 3 in week 0
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        build(bob, MILANO); // week 1: Milano 1 new, Roma 0 new
        _payStreet(0.2 ether);
        vm.warp(vault.weekEnd());
        vault.settle();
        assertEq(vault.cityStreetFunds(MILANO), 0.03 ether);
        assertEq(vault.cityStreetFunds(ROMA), 0);
    }

    function test_tiedDistrictsShareByBuildingCount() public {
        build(alice, MILANO);
        build(bob, ROMA);
        build(carol, ROMA); // Roma 2 new
        build(alice, MILANO); // Milano 2 new: a tie
        _payStreet(0.2 ether);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        assertEq(vault.cityStreetFunds(MILANO), 0.015 ether);
        assertEq(vault.cityStreetFunds(ROMA), 0.015 ether);
    }

    function test_tieWithDifferentSizesStillEqualPerBuilding() public {
        buildMany(alice, MILANO, 2); // week 0
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        build(alice, MILANO); // week 1: Milano 1 new (3 total)
        build(bob, ROMA); // week 1: Roma 1 new (1 total) -> tie
        _payStreet(0.2 ether);
        vm.warp(vault.weekEnd());
        vault.settle();
        // Shared among the 4 buildings of the tied cities: 3/4 Milano, 1/4 Roma.
        assertEq(vault.cityStreetFunds(MILANO), 0.0225 ether);
        assertEq(vault.cityStreetFunds(ROMA), 0.0075 ether);
    }

    function test_nobodyBuiltAllBuiltDistrictsShare() public {
        build(alice, MILANO);
        build(bob, ROMA);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        _payStreet(0.2 ether); // week 1, nobody builds
        vm.warp(vault.weekEnd());
        vault.settle();
        assertEq(vault.cityStreetFunds(MILANO), 0.015 ether);
        assertEq(vault.cityStreetFunds(ROMA), 0.015 ether);
        assertEq(vault.cityStreetFunds(NAPOLI), 0); // never built
    }

    function test_noResidentsStreetShareRollsOver() public {
        _payStreet(0.2 ether);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        assertEq(vault.streetFunds(), 0.03 ether); // nobody to win it
        build(alice, ROMA);
        vm.warp(vault.weekEnd());
        vault.settle();
        assertEq(vault.streetFunds(), 0);
        assertEq(vault.cityStreetFunds(ROMA), 0.03 ether);
    }

    function test_afterCityCompleteSharedCityWide() public {
        vm.warp(START);
        buildMany(alice, MILANO, 300);
        goPublic();
        buildMany(alice, MILANO, 2000);
        buildMany(bob, ROMA, 700);
        assertEq(vault.residents(), 3000);
        _payStreet(1 ether);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        // Milano had 2,300 new this week, but the competition is over: everybody shares.
        assertEq(vault.cityStreetFunds(MILANO), uint256(0.15 ether) * 2300 / 3000);
        assertEq(vault.cityStreetFunds(ROMA), uint256(0.15 ether) * 700 / 3000);
    }

    // ─────────── settlement ───────────

    function test_settleIsLazyOnBuildBuyClaim() public {
        build(alice, 0);
        vm.warp(FIRST_DEADLINE);
        assertEq(vault.week(), 0);
        vm.prank(alice);
        vault.claim(1);
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
        build(alice, MILANO);
        payTax(0.05 ether); // below the minimum order all week
        vault.settle();
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        // 0.035 residents' share + 0.0075 street prize won by Milano, both still unspent.
        assertEq(vault.residentsFunds() + vault.cityStreetTotal(), 0.0425 ether);
        payTax(0.1 ether);
        assertTrue(vault.requestBuy());
        assertEq(vault.residentsFunds() + vault.cityStreetTotal(), 0);
        assertEq(vault.streetFunds(), 0.015 ether); // this week's street share waits
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

    function test_vaultCountBounds() public {
        assertEq(vault.districts(), 5);
        assertEq(vault.tokenCount(), 5);
        IERC20[] memory none = new IERC20[](0);
        ISwapAdapter[] memory noRoutes = new ISwapAdapter[](0);
        IMontraHook noEscrow = IMontraHook(address(0));
        vm.expectRevert(CapitaleVault.BadConfig.selector);
        deployVault(none, noRoutes, 5, noEscrow); // no reward token
        IERC20[] memory toks = allTokens();
        ISwapAdapter[] memory routes = allRoutes();
        vm.expectRevert(CapitaleVault.BadConfig.selector);
        deployVault(toks, noRoutes, 5, noEscrow); // tokens without swap routes
        vm.expectRevert(CapitaleVault.BadConfig.selector);
        deployVault(toks, routes, 0, noEscrow); // no city
        vm.expectRevert(CapitaleVault.BadConfig.selector);
        deployVault(toks, routes, 6, noEscrow); // too many cities
    }

    // ─────────── five cities ───────────

    function test_streetRaceBetweenFiveCities() public {
        build(alice, NAPOLI);
        build(bob, PALERMO);
        build(carol, PALERMO); // Palermo: 2 new this week, wins
        build(alice, MILANO);
        _payStreet(0.2 ether);
        vm.warp(FIRST_DEADLINE);
        vault.settle();
        assertEq(vault.cityStreetFunds(PALERMO), 0.03 ether);
        assertEq(vault.cityStreetFunds(NAPOLI) + vault.cityStreetFunds(MILANO), 0);
        assertEq(vault.newBuildsOf(0).length, 5);
        // Bought in Palermo's token.
        assertTrue(vault.requestBuy());
        assertGt(vault.pending(2, NUM_IDX), vault.pending(1, CHAMELEON_IDX) * 0);
        assertEq(vault.cityStreetTotal(), 0);
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
        assertEq(vaultIncome(), 1 ether);
    }
}
