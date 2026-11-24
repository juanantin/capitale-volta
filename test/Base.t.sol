// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CapitaleNFT} from "../src/CapitaleNFT.sol";
import {CapitalePricing} from "../src/CapitalePricing.sol";
import {CapitaleVault, ICapitaleNFTView, IMontraHook, IWETH} from "../src/CapitaleVault.sol";
import {ICapitaleOracle} from "../src/interfaces/ICapitaleOracle.sol";
import {ICapitalePricing} from "../src/interfaces/ICapitalePricing.sol";
import {ICapitaleVault} from "../src/interfaces/ICapitaleVault.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockOracle} from "./mocks/MockOracle.sol";
import {MockSwapAdapter} from "./mocks/MockSwapAdapter.sol";

abstract contract BaseTest is Test {
    // Monday 2026-11-02 10:00 UTC. First weekly deadline: Sunday 2026-11-08 19:00 UTC (20:00 CET).
    uint256 internal constant T0 = 1793613600;
    uint256 internal constant FIRST_DEADLINE = 1794164400;
    uint256 internal constant START = T0 + 1 hours;

    uint256 internal constant CAP_PRICE = 1e15; // $0.001
    // Test income token (stands in for HYPE, which $CAPITALE is paired with on Montra). Its
    // made-up price keeps the arithmetic of the buy tests simple: 1 income token = $3,000.
    uint256 internal constant INCOME_USD = 3000e18;

    // Reward tokens, in the vault's order (Montra's top tokens).
    uint8 internal constant MONTRA_IDX = 0;
    uint8 internal constant LIQUIDV_IDX = 1;
    uint8 internal constant EACCAT_IDX = 2; // 6 decimals in the tests, on purpose
    uint8 internal constant CHAMELEON_IDX = 3;
    uint8 internal constant NUM_IDX = 4;
    uint8 internal constant N_TOKENS = 5;

    // Cities and the token each earns.
    uint8 internal constant MILANO = 0; // LiquidV
    uint8 internal constant ROMA = 1; // MONTRA
    uint8 internal constant NAPOLI = 2; // CHAMELEON
    uint8 internal constant VENEZIA = 3; // EACCAT
    uint8 internal constant PALERMO = 4; // NUM
    uint8 internal constant N_CITIES = 5;

    bytes32 internal constant POOL_ID = keccak256("capitale/hype");

    address internal admin = makeAddr("timelock");
    address internal opsSafe = makeAddr("opsSafe");
    address internal mayor = makeAddr("mayor");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    MockERC20 internal capitale;
    MockERC20[5] internal rewards;
    MockERC20 internal hype; // the income (an ERC-20 stand-in; native HYPE is tested separately)
    MockOracle internal oracle;
    MockSwapAdapter internal adapter;
    CapitalePricing internal pricing;
    CapitaleNFT internal nft;
    CapitaleVault internal vault;

    uint256[5] internal tokenUsd = [uint256(1e18), 0.5e18, 2e18, 0.25e18, 4e18];

    function setUp() public virtual {
        vm.warp(T0);
        capitale = new MockERC20("Capitale", "CAPITALE", 18);
        rewards[MONTRA_IDX] = new MockERC20("Montra", "MONTRA", 18);
        rewards[LIQUIDV_IDX] = new MockERC20("LiquidV", "LiquidV", 18);
        rewards[EACCAT_IDX] = new MockERC20("eaccat", "EACCAT", 6);
        rewards[CHAMELEON_IDX] = new MockERC20("CHAMELEON", "CHAMELEON", 18);
        rewards[NUM_IDX] = new MockERC20("Numpay", "NUM", 18);
        hype = new MockERC20("HYPE", "HYPE", 18);

        oracle = new MockOracle();
        oracle.setCapitale(CAP_PRICE, CAP_PRICE);
        oracle.setIncomeUsd(INCOME_USD);
        adapter = new MockSwapAdapter();
        for (uint256 i; i < N_TOKENS; ++i) {
            oracle.setTokenUsd(address(rewards[i]), tokenUsd[i]);
            adapter.setPrices(INCOME_USD, address(rewards[i]), tokenUsd[i]);
        }

        pricing = new CapitalePricing(
            admin, ICapitaleOracle(address(oracle)), START, 300, 40e18, [uint256(52e18), 68e18, 88e18, 120e18]
        );
        nft = new CapitaleNFT(IERC20(address(capitale)), ICapitalePricing(address(pricing)), mayor, N_CITIES);
        vault = deployVault(allTokens(), allRoutes(), N_CITIES, IMontraHook(address(0)));
        nft.setVault(ICapitaleVault(address(vault)));
        vm.startPrank(admin);
        pricing.setNft(address(nft));
        vm.stopPrank();
    }

    function allTokens() internal view returns (IERC20[] memory toks) {
        toks = new IERC20[](N_TOKENS);
        for (uint256 i; i < N_TOKENS; ++i) {
            toks[i] = IERC20(address(rewards[i]));
        }
    }

    function allRoutes() internal view returns (ISwapAdapter[] memory routes) {
        routes = new ISwapAdapter[](N_TOKENS);
        for (uint256 i; i < N_TOKENS; ++i) {
            routes[i] = adapter;
        }
    }

    function cityTokens() internal pure returns (uint8[5] memory) {
        return [LIQUIDV_IDX, MONTRA_IDX, CHAMELEON_IDX, EACCAT_IDX, NUM_IDX];
    }

    function deployVault(IERC20[] memory toks, ISwapAdapter[] memory routes, uint8 cities, IMontraHook hook_)
        internal
        returns (CapitaleVault)
    {
        return deployVaultWith(toks, routes, cities, hook_, cityTokens());
    }

    function deployVaultWith(
        IERC20[] memory toks,
        ISwapAdapter[] memory routes,
        uint8 cities,
        IMontraHook hook_,
        uint8[5] memory cityTokens_
    ) internal returns (CapitaleVault) {
        return new CapitaleVault(
            CapitaleVault.Setup({
                owner: admin,
                nft: ICapitaleNFTView(address(nft)),
                earlyBirdEnd: START + 6 hours,
                income: IERC20(address(hype)),
                hook: hook_,
                poolId: POOL_ID,
                oracle: ICapitaleOracle(address(oracle)),
                ops: opsSafe,
                weth: IWETH(address(0)),
                districts: cities,
                cityTokens: cityTokens_
            }),
            toks,
            routes,
            defaultParams()
        );
    }

    /// Income held by the vault (HYPE is not a reward token here).
    function vaultIncome() internal view returns (uint256) {
        return hype.balanceOf(address(vault));
    }

    function defaultParams() internal pure returns (CapitaleVault.BuyParams memory) {
        return CapitaleVault.BuyParams({
            minOrder: 0.1 ether,
            maxOrder: 0.6 ether,
            minInterval: 10 minutes,
            rejectPause: 6 hours,
            maxDeviationBps: 400
        });
    }

    // ─────────── helpers ───────────

    function build(address who, uint8 district) internal returns (uint256 id) {
        return build(who, district, 0, 0);
    }

    function build(address who, uint8 district, uint8 style, uint256 inviter) internal returns (uint256 id) {
        capitale.mint(who, 1_000_000e18);
        vm.startPrank(who);
        capitale.approve(address(nft), type(uint256).max);
        id = nft.mint(district, style, inviter, type(uint256).max);
        vm.stopPrank();
    }

    function buildMany(address who, uint8 district, uint256 n) internal {
        capitale.mint(who, n * 1_000_000e18);
        vm.startPrank(who);
        capitale.approve(address(nft), type(uint256).max);
        for (uint256 i; i < n; ++i) {
            nft.mint(district, 0, 0, type(uint256).max);
        }
        vm.stopPrank();
    }

    function payTax(uint256 amount) internal {
        hype.mint(address(vault), amount); // creator fees arriving in HYPE
    }

    function goPublic() internal {
        vm.warp(pricing.earlyBirdEnd());
    }

    function ids1(uint256 a) internal pure returns (uint256[] memory r) {
        r = new uint256[](1);
        r[0] = a;
    }

    function ids2(uint256 a, uint256 b) internal pure returns (uint256[] memory r) {
        r = new uint256[](2);
        r[0] = a;
        r[1] = b;
    }

    /// Tokens bought by an order of `amount` income at the oracle price.
    function fill(uint8 t, uint256 amount) internal view returns (uint256) {
        return (amount * INCOME_USD * (10 ** rewards[t].decimals())) / (tokenUsd[t] * 1e18);
    }
}
