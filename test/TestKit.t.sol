// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestKit, TestToken, TestSwapAdapter} from "../src/testnet/TestKit.sol";
import {CapitaleNFT} from "../src/CapitaleNFT.sol";
import {CapitalePricing} from "../src/CapitalePricing.sol";
import {CapitaleVault, ICapitaleNFTView, IMontraHook, IWETH} from "../src/CapitaleVault.sol";
import {ICapitaleOracle} from "../src/interfaces/ICapitaleOracle.sol";
import {ICapitalePricing} from "../src/interfaces/ICapitalePricing.sol";
import {ICapitaleVault} from "../src/interfaces/ICapitaleVault.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";

/// The exact deploy sequence the website's "Deploy test city" button runs, end to end:
/// $CAPITALE trading books creator fees (in test HYPE) in the Montra hook stand-in, the vault
/// claims them, buys each city's token and buildings claim them.
contract TestKitTest is Test {
    address juan = makeAddr("juan");

    function test_fullTestFlow() public {
        vm.warp(1_793_613_600);
        vm.startPrank(juan);
        TestKit kit = new TestKit();
        CapitalePricing pricing = new CapitalePricing(
            juan, ICapitaleOracle(address(kit.oracle())), block.timestamp, 300, 40e18, [uint256(52e18), 68e18, 88e18, 120e18]
        );
        CapitaleNFT nft = new CapitaleNFT(IERC20(address(kit.capitale())), ICapitalePricing(address(pricing)), juan, 5);
        TestToken[5] memory r = kit.rewardTokens();
        IERC20[] memory toks = new IERC20[](5);
        ISwapAdapter[] memory routes = new ISwapAdapter[](5);
        for (uint256 i; i < 5; ++i) {
            toks[i] = IERC20(address(r[i]));
            routes[i] = ISwapAdapter(address(kit.adapter()));
        }
        bytes32 poolId = kit.POOL_ID();
        CapitaleVault vault = new CapitaleVault(
            CapitaleVault.Setup({
                owner: juan,
                nft: ICapitaleNFTView(address(nft)),
                earlyBirdEnd: pricing.earlyBirdEnd(),
                income: IERC20(address(kit.hype())),
                hook: IMontraHook(address(kit.hook())),
                poolId: poolId,
                oracle: ICapitaleOracle(address(kit.oracle())),
                ops: juan,
                weth: IWETH(address(0)),
                districts: 5,
                // Milano tLiquidV, Roma tMONTRA, Napoli tCHAMELEON, Venezia tEACCAT, Palermo tNUM.
                cityTokens: [uint8(1), 0, 3, 2, 4]
            }),
            toks,
            routes,
            CapitaleVault.BuyParams({minOrder: 0.1e18, maxOrder: 10e18, minInterval: 10 minutes, rejectPause: 6 hours, maxDeviationBps: 400})
        );
        pricing.setNft(address(nft));
        nft.setVault(ICapitaleVault(address(vault)));

        kit.capitale().faucet();
        kit.capitale().approve(address(nft), type(uint256).max);
        assertEq(nft.mint(2, 1, 0, type(uint256).max), 1); // a Napoli palazzo
        assertEq(nft.mint(1, 0, 0, type(uint256).max), 2); // a Roma palazzo
        vm.stopPrank();

        // $CAPITALE trades; Montra books the creator share for the vault; anyone claims it.
        kit.hook().simulateTrading(poolId, address(vault), 2e18);
        assertEq(vault.collectCreatorFees(), 2e18);
        assertEq(vault.totalTax(), 2e18);
        assertTrue(vault.requestBuy()); // 1.4 tHYPE: half to Napoli (tCHAMELEON), half to Roma (tMONTRA)
        vm.warp(block.timestamp + 6 hours);
        vault.settle();
        assertGt(vault.pending(1, 3), 0);
        assertGt(vault.pending(2, 0), 0);
        assertEq(vault.pending(1, 0) + vault.pending(2, 3), 0);

        uint256 owed = vault.pending(1, 3);
        vm.prank(juan);
        vault.claim(1);
        assertEq(r[3].balanceOf(juan), owed);

        // A bad fill is rejected and pauses buying.
        TestSwapAdapter adapter = kit.adapter();
        vm.prank(juan);
        adapter.setQuality(9_000);
        kit.hook().simulateTrading(poolId, address(vault), 2e18);
        vault.collectCreatorFees();
        vm.warp(block.timestamp + 10 minutes);
        assertFalse(vault.requestBuy());
        assertGt(vault.pausedUntil(), block.timestamp);
    }
}
