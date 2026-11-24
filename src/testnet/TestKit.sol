// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// TEST ONLY. Stand-ins for $CAPITALE, HYPE (the income, as a faucet token), the five Montra
// reward tokens, the price feed, the swap route and Montra's LaunchHook, so the whole city can
// be exercised end to end with tokens that have no value.
// Test tokens have no value. Never wire these into a real city.

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICapitaleOracle} from "../interfaces/ICapitaleOracle.sol";
import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";

/// @notice Free-to-mint test token. `faucet()` gives anyone a fixed amount.
contract TestToken is ERC20 {
    uint8 private immutable _dec;
    uint256 public immutable faucetAmount;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 faucetAmount_)
        ERC20(name_, symbol_)
    {
        _dec = decimals_;
        faucetAmount = faucetAmount_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function faucet() external {
        _mint(msg.sender, faucetAmount);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Price feed whose prices the tester sets by hand (stands in for the Montra pool price reference).
contract TestOracle is ICapitaleOracle, Ownable {
    uint256 public spot;
    uint256 public twap;
    uint256 public incomePrice;
    mapping(address => uint256) public price;

    event PricesSet();

    constructor(address owner_) Ownable(owner_) {}

    function setCapitale(uint256 spot_, uint256 twap_) external onlyOwner {
        spot = spot_;
        twap = twap_;
        emit PricesSet();
    }

    function setIncomeUsd(uint256 p) external onlyOwner {
        incomePrice = p;
        emit PricesSet();
    }

    function setTokenUsd(address token, uint256 p) external onlyOwner {
        price[token] = p;
        emit PricesSet();
    }

    function capitaleUsdSpot() external view returns (uint256) {
        require(spot != 0, "no price");
        return spot;
    }

    function capitaleUsdTwap() external view returns (uint256) {
        require(twap != 0, "no price");
        return twap;
    }

    function incomeUsd() external view returns (uint256) {
        require(incomePrice != 0, "no price");
        return incomePrice;
    }

    function tokenUsd(address token) external view returns (uint256) {
        require(price[token] != 0, "no price");
        return price[token];
    }
}

/// @notice "Buys" a reward token by taking the income token and minting the reward at the
///         oracle price. `qualityBps` below 10000 simulates a bad fill (4% rejection, 6h pause).
contract TestSwapAdapter is ISwapAdapter, Ownable {
    TestOracle public immutable oracle;
    uint256 public qualityBps = 10_000;

    constructor(TestOracle oracle_, address owner_) Ownable(owner_) {
        oracle = oracle_;
    }

    function setQuality(uint256 q) external onlyOwner {
        require(q > 0 && q <= 20_000, "bad quality");
        qualityBps = q;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address recipient)
        external
        payable
        returns (uint256 out)
    {
        if (tokenIn == address(0)) require(msg.value == amountIn, "value");
        else IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        uint8 dIn = tokenIn == address(0) ? 18 : TestToken(tokenIn).decimals();
        uint8 dOut = TestToken(tokenOut).decimals();
        out = (amountIn * oracle.incomeUsd() * (10 ** dOut)) / (oracle.tokenUsd(tokenOut) * (10 ** dIn));
        out = (out * qualityBps) / 10_000;
        require(out >= minOut, "slippage");
        TestToken(tokenOut).mint(recipient, out);
    }
}

/// @notice Stand-in for Montra's LaunchHook. `simulateTrading` books creator-side fees for a
///         pool, in the test income token, as $CAPITALE trading would; only the pool's
///         recipient (the vault) can claim them.
contract TestMontraHook {
    TestToken public immutable quote;
    mapping(bytes32 => uint256) public tab;
    mapping(bytes32 => address) public recipient;

    event FeesBooked(bytes32 indexed poolId, uint256 amount);

    constructor(TestToken quote_) {
        quote = quote_;
    }

    /// The first call names the pool's recipient (like a launch naming its fee recipient).
    function simulateTrading(bytes32 poolId, address recipient_, uint256 creatorFees) external {
        if (recipient[poolId] == address(0)) recipient[poolId] = recipient_;
        quote.mint(address(this), creatorFees);
        tab[poolId] += creatorFees;
        emit FeesBooked(poolId, creatorFees);
    }

    function claim(bytes32 poolId, address to) external returns (uint256 amount) {
        require(msg.sender == recipient[poolId], "not recipient");
        amount = tab[poolId];
        tab[poolId] = 0;
        if (amount != 0) quote.transfer(to, amount);
    }
}

/// @notice Deploys every test stand-in in one transaction, with realistic starting prices.
///         Income: tHYPE. Reward tokens, in the vault's order: tMONTRA, tLiquidV, tEACCAT,
///         tCHAMELEON, tNUM.
contract TestKit {
    bytes32 public constant POOL_ID = keccak256("capitale-test-pool");
    TestToken public immutable capitale;
    TestToken public immutable hype;
    TestToken[5] public rewards;
    TestOracle public immutable oracle;
    TestSwapAdapter public immutable adapter;
    TestMontraHook public immutable hook;

    constructor() {
        capitale = new TestToken("Capitale (test)", "tCAPITALE", 18, 1_000_000e18);
        hype = new TestToken("HYPE (test)", "tHYPE", 18, 100e18);
        rewards[0] = new TestToken("Montra (test)", "tMONTRA", 18, 0);
        rewards[1] = new TestToken("LiquidV (test)", "tLiquidV", 18, 0);
        rewards[2] = new TestToken("eaccat (test)", "tEACCAT", 18, 0);
        rewards[3] = new TestToken("CHAMELEON (test)", "tCHAMELEON", 18, 0);
        rewards[4] = new TestToken("Numpay (test)", "tNUM", 18, 0);
        oracle = new TestOracle(address(this));
        oracle.setCapitale(0.001e18, 0.001e18); // $0.001
        oracle.setIncomeUsd(62e18); // $62 per HYPE
        uint256[5] memory usd = [uint256(0.004e18), 0.0009e18, 0.00027e18, 0.0002e18, 0.00016e18];
        for (uint256 i; i < 5; ++i) {
            oracle.setTokenUsd(address(rewards[i]), usd[i]);
        }
        oracle.transferOwnership(msg.sender);
        adapter = new TestSwapAdapter(oracle, msg.sender);
        hook = new TestMontraHook(hype);
    }

    function rewardTokens() external view returns (TestToken[5] memory) {
        return rewards;
    }
}
