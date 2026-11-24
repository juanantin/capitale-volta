// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CapitaleVault, ICapitaleNFTView, IMontraHook, IWETH} from "../src/CapitaleVault.sol";
import {ICapitaleOracle} from "../src/interfaces/ICapitaleOracle.sol";
import {MockMontraHook} from "./mocks/MockMontraHook.sol";

/// Montra-specific behaviour: creator fees claimed from Montra's LaunchHook (in HYPE, the pair
/// asset), holder rewards of held tokens recycled into city tax, native HYPE income.
contract CapitaleVaultMontraTest is BaseTest {
    MockMontraHook internal hook;

    function setUp() public override {
        super.setUp();
        goPublic();
        hook = new MockMontraHook();
    }

    function _nativeVault(IMontraHook hook_) internal returns (CapitaleVault) {
        return new CapitaleVault(
            CapitaleVault.Setup({
                owner: admin,
                nft: ICapitaleNFTView(address(nft)),
                earlyBirdEnd: START + 6 hours,
                income: IERC20(address(0)), // native HYPE
                hook: hook_,
                poolId: POOL_ID,
                oracle: ICapitaleOracle(address(oracle)),
                ops: opsSafe,
                weth: IWETH(address(0)),
                districts: N_CITIES,
                cityTokens: cityTokens()
            }),
            allTokens(),
            allRoutes(),
            defaultParams()
        );
    }

    function test_collectCreatorFeesFromHook() public {
        CapitaleVault v2 = deployVault(allTokens(), allRoutes(), N_CITIES, IMontraHook(address(hook)));
        hook.setRecipient(POOL_ID, address(v2), address(hype));
        hook.book(POOL_ID, 50e18);
        vm.prank(carol); // anyone can trigger it
        assertEq(v2.collectCreatorFees(), 50e18);
        assertEq(v2.totalTax(), 50e18);
        assertEq(v2.residentsFunds(), 35e18);
        assertEq(v2.collectCreatorFees(), 0); // nothing left to collect
    }

    function test_collectRevertsUntilTheVaultIsTheRecipient() public {
        CapitaleVault v2 = deployVault(allTokens(), allRoutes(), N_CITIES, IMontraHook(address(hook)));
        hook.setRecipient(POOL_ID, alice, address(hype)); // still the launcher's wallet
        hook.book(POOL_ID, 1e18);
        vm.expectRevert(MockMontraHook.NotRecipient.selector);
        v2.collectCreatorFees();
    }

    function test_collectWithoutHookReverts() public {
        vm.expectRevert(CapitaleVault.BadConfig.selector);
        vault.collectCreatorFees();
    }

    function test_nativeHypeIncomeEndToEnd() public {
        CapitaleVault v2 = _nativeVault(IMontraHook(address(hook)));
        assertEq(v2.incomeRewardIndex(), v2.NO_TOKEN());
        hook.setRecipient(POOL_ID, address(v2), address(0));
        vm.deal(address(this), 1 ether);
        hook.book{value: 1 ether}(POOL_ID, 1 ether);
        assertEq(v2.collectCreatorFees(), 1 ether);
        assertEq(v2.residentsFunds(), 0.7 ether);
        vm.prank(address(nft));
        v2.onMint(1, MILANO, false); // a building to receive the LiquidV bought with HYPE
        assertTrue(v2.requestBuy());
        assertEq(address(v2).balance, 0.4 ether); // 0.6 spent, 0.1 residents + 0.15 street + 0.15 ops left
        assertEq(v2.pending(1, LIQUIDV_IDX), fill(LIQUIDV_IDX, 0.6 ether));
    }

    function test_holderRewardsBecomeCityTax() public {
        rewards[EACCAT_IDX].setRewardAsset(hype); // EACCAT pays its holders in HYPE
        build(alice, VENEZIA);
        payTax(0.2 ether);
        assertTrue(vault.requestBuy()); // the vault now holds EACCAT
        uint256 taxBefore = vault.totalTax();
        rewards[EACCAT_IDX].accrueReward(address(vault), 0.5 ether);
        vm.prank(bob); // anyone can trigger it; tokens that pay nothing are skipped
        assertEq(vault.claimHolderRewards(), 0.5 ether);
        assertEq(vault.totalTax(), taxBefore + 0.5 ether);
        assertEq(vault.residentsFunds(), 0.35 ether); // 70% of it, waiting for the next order
        // The EACCAT owed to buildings is untouched.
        assertEq(rewards[EACCAT_IDX].balanceOf(address(vault)), vault.heldRewards(EACCAT_IDX));
    }

    function test_opsPaidInHype() public {
        payTax(1 ether);
        vm.prank(bob);
        vault.payOps();
        assertEq(hype.balanceOf(opsSafe), 0.15 ether);
    }

    function test_swapAllowanceIsExactAndReset() public {
        build(alice, MILANO);
        payTax(1 ether);
        adapter.setTakeMore(true); // tries to pull 1 wei more than approved: the fill fails
        assertFalse(vault.requestBuy());
        assertEq(vault.residentsFunds() + vault.streetFunds(), 0.85 ether);
        assertEq(hype.allowance(address(vault), address(adapter)), 0);
        vm.warp(block.timestamp + 6 hours);
        adapter.setTakeMore(false);
        assertTrue(vault.requestBuy());
        assertEq(hype.allowance(address(vault), address(adapter)), 0);
    }
}
