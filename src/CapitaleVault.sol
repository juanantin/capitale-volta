// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICapitaleOracle} from "./interfaces/ICapitaleOracle.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";
import {ICapitaleVault} from "./interfaces/ICapitaleVault.sol";
import {RomeTime} from "./libraries/RomeTime.sol";

interface ICapitaleNFTView {
    function ownerOf(uint256 id) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
}

interface IWETH {
    function withdraw(uint256) external;
}

/// @notice Volta's FeeEscrow on Elysium: holds each recipient's fee share until withdrawn.
interface IFeeEscrow {
    function withdrawFees(address token, address recipient, bool unwrap) external;
    function balances(address recipient, address token) external view returns (uint256);
}

/// @title CapitaleVault
/// @notice Receives all of $CAPITALE's creator-fee income and turns it into rewards:
///         70% buys this week's token for residents, 15% buys it for the weekly street pool,
///         15% stays as income for operations (paid only to the ops multisig).
///
///         Income is one asset fixed at deploy: an ERC-20 (Capitale on Volta: $VOLTA, the
///         asset $CAPITALE is paired with) or the chain's native coin (`income == address(0)`).
///         On Volta the vault holds $CAPITALE's creator NFT, so the creator share of every
///         trading fee is credited to it in Volta's FeeEscrow; anyone can call
///         collectCreatorFees() to pull it in.
///
///         If the income asset is also a reward token (VOLTA), "buying" it is a direct
///         allocation with no swap. The vault keeps reward tokens owed to buildings
///         (`heldRewards`) apart from fresh income, so they never get re-split as tax.
///
///         Buying is rule-bound and anyone may trigger it: minimum order, maximum order, one
///         order at a time, a minimum interval, and a price check against the oracle reference.
///         An order that misses the reference by more than the allowed deviation is rejected,
///         its ETH stays in the vault and buying pauses (6h by default).
///
///         Residents' purchases are split equally among buildings existing at purchase time.
///         During the early-bird window they go to an early-bird pool that is shared among
///         early-bird buildings when the window closes.
///
///         Every week (deadline Sunday 20:00 Rome time) the vote picks next week's token, and
///         the district with the most new buildings wins the street pool. Settlement is lazy:
///         it runs on the next vote / build / buy / claim, or when anyone calls settle().
///
/// @dev    Not upgradeable. The owner (a 48h TimelockController) can only change the oracle,
///         swap adapters, buy parameters and the ops address. There is no function that moves
///         reward tokens or ETH anywhere except claims (to building owners), the ops share
///         (to the ops address) and swaps (through whitelisted adapters, checked against the
///         oracle).
contract CapitaleVault is ICapitaleVault, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant ACC = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 public constant RESIDENTS_BPS = 7_000;
    uint256 public constant STREET_BPS = 1_500;
    uint256 public constant MAX_BUILDINGS = 3000;
    uint256 public constant IDLE_AFTER = 24 hours;
    uint256 public constant MAX_WEEKS_PER_SETTLE = 52;
    /// Storage is sized for up to this many districts (cities) and reward tokens.
    uint8 public constant MAX_DISTRICTS = 4;
    uint8 public constant MAX_TOKENS = 4;

    ICapitaleNFTView public immutable nft;
    uint256 public immutable earlyBirdEnd;
    IWETH public immutable weth;
    /// Income asset: an ERC-20, or address(0) for the native coin.
    IERC20 public immutable income;
    uint8 public immutable incomeDecimals;
    /// Volta FeeEscrow the creator share is credited to (address(0) if not used).
    IFeeEscrow public immutable feeEscrow;
    /// Index of the income asset among the reward tokens, or NO_TOKEN.
    uint8 public immutable incomeRewardIndex;
    uint8 public constant NO_TOKEN = type(uint8).max;
    /// Number of districts (cities), fixed at deploy. Capitale: 4 (Milano, Roma, Napoli, Venezia).
    /// Cities only matter for plots and the weekly street competition.
    uint8 public immutable districts;
    /// Number of reward tokens, fixed at deploy. Capitale: 2 (STOCKIFY, STONKEX). The weekly
    /// vote picks which one is bought; every building in every city earns it.
    uint8 public immutable tokenCount;
    IERC20[4] public tokens;
    uint8[4] public tokenDecimals;

    ICapitaleOracle public oracle;
    ISwapAdapter[4] public adapters;
    address public ops;

    struct BuyParams {
        uint128 minOrder; // income units
        uint128 maxOrder; // income units
        uint32 minInterval; // seconds between orders
        uint32 rejectPause; // pause after a rejected order
        uint16 maxDeviationBps; // allowed shortfall vs the reference price
    }

    BuyParams public buyParams;
    uint256 public lastBuyAt;
    uint256 public lastRequestAt;
    uint256 public pausedUntil;
    uint256 public immutable deployedAt;

    // Income buckets (everything else in the income balance is new, not yet split, income).
    uint256 public residentsFunds;
    uint256 public streetFunds;
    uint256 public opsFunds;
    /// Reward tokens bought and not yet claimed (pools, accumulators, carry).
    uint256[4] public heldRewards;

    // Week state.
    uint256 public week;
    uint256 public weekEnd;
    uint8 public currentToken;
    mapping(uint256 => uint256[4]) internal _votes;
    mapping(uint256 => uint256[4]) internal _newBuilds;
    mapping(uint256 => uint256) public lastVotedWeek; // week + 1, 0 = never

    // Residents.
    struct Resident {
        bool registered;
        bool earlyBird;
        uint8 district;
    }

    mapping(uint256 => Resident) public residentOf;
    uint256 public residents;
    uint256[4] public districtResidents;
    uint256 public earlyBirdCount;
    bool public earlyBirdFinalized;

    // Pools waiting for distribution (reward-token units / USD 1e18).
    uint256[4] public streetPool;
    uint256[4] public streetPoolUsd;
    uint256[4] public earlyBirdPool;
    uint256[4] public earlyBirdPoolUsd;
    uint256[4] public carry;
    uint256[4] public carryUsd;

    // Accumulators: reward per building, scaled by ACC.
    uint256[4] public accGlobal;
    uint256[4] public accGlobalUsd;
    uint256[4][4] internal _accDistrict; // [district][token]
    uint256[4][4] internal _accDistrictUsd;
    uint256[4] public accEarlyBird;
    uint256[4] public accEarlyBirdUsd;
    mapping(uint256 => uint256[4]) internal _debt;
    mapping(uint256 => uint256[4]) internal _debtUsd;
    /// Cumulative USD claimed by a building, valued at purchase time (drives its height).
    mapping(uint256 => uint256) public claimedUsd;

    // Stats.
    uint256 public totalTax;
    uint256 public totalPurchases;
    uint256 public totalBoughtUsd;
    uint256[4] public totalBought;

    event TaxReceived(uint256 amount, uint256 residents, uint256 street, uint256 ops);
    event Bought(uint256 indexed week, uint8 indexed token, uint256 amountIn, uint256 tokensOut, uint256 usd);
    event BuyRejected(uint256 indexed week, uint8 indexed token, uint256 amountIn, uint256 minOut, bytes reason);
    event CreatorFeesCollected(uint256 amount);
    event BuySkipped(uint8 reason);
    event Distributed(uint8 indexed token, uint256 amount, uint256 buildings);
    event EarlyBirdFinalized(uint256 buildings);
    event StreetWon(uint256 indexed week, uint8 indexed token, uint8 winnersMask, uint256 amount, uint256 buildings);
    event Voted(uint256 indexed week, uint256 indexed id, uint8 token);
    event WeekSettled(uint256 indexed week, uint8 nextToken, uint256 nextDeadline);
    event Claimed(uint256 indexed id, address indexed owner, uint8 indexed token, uint256 amount, uint256 usd);
    event ClaimSkipped(address indexed owner, uint8 indexed token, uint256 amount);
    event OpsPaid(address indexed ops, uint256 amount);
    event OracleSet(address oracle);
    event AdapterSet(uint8 indexed token, address adapter);
    event BuyParamsSet(BuyParams params);
    event OpsSet(address ops);

    // requestBuy skip reasons
    uint8 public constant SKIP_PAUSED = 1;
    uint8 public constant SKIP_TOO_SOON = 2;
    uint8 public constant SKIP_BELOW_MIN = 3;

    error NotNft();
    error NotSelf();
    error BadConfig();
    error BadToken();
    error NotBuildingOwner(uint256 id);
    error MayorExcluded();
    error AlreadyVoted(uint256 id);
    error NoAdapter();
    error PriceDeviation(uint256 got, uint256 minOut);
    error NothingToPay();
    error OpsTransferFailed();

    /// Deploy-time settings (grouped to keep the constructor readable).
    struct Setup {
        address owner;
        ICapitaleNFTView nft;
        uint256 earlyBirdEnd;
        IERC20 income;
        IFeeEscrow feeEscrow;
        ICapitaleOracle oracle;
        address ops;
        IWETH weth;
        uint8 districts;
        uint8 initialToken;
    }

    constructor(Setup memory c, IERC20[] memory tokens_, ISwapAdapter[] memory adapters_, BuyParams memory params_)
        Ownable(c.owner)
    {
        if (address(c.nft) == address(0) || address(c.oracle) == address(0) || c.ops == address(0)) revert BadConfig();
        uint256 n = tokens_.length;
        if (n == 0 || n > MAX_TOKENS || adapters_.length != n) revert BadConfig();
        if (c.districts == 0 || c.districts > MAX_DISTRICTS) revert BadConfig();
        if (c.initialToken >= n) revert BadToken();
        tokenCount = uint8(n);
        districts = c.districts;
        nft = c.nft;
        earlyBirdEnd = c.earlyBirdEnd;
        weth = c.weth;
        income = c.income;
        incomeDecimals = address(c.income) == address(0) ? 18 : IERC20Metadata(address(c.income)).decimals();
        feeEscrow = c.feeEscrow;
        uint8 incomeIdx = NO_TOKEN;
        for (uint256 i; i < n; ++i) {
            if (address(tokens_[i]) == address(0)) revert BadConfig();
            for (uint256 j; j < i; ++j) {
                if (tokens_[i] == tokens_[j]) revert BadConfig();
            }
            tokens[i] = tokens_[i];
            tokenDecimals[i] = IERC20Metadata(address(tokens_[i])).decimals();
            adapters[i] = adapters_[i];
            if (tokens_[i] == c.income) incomeIdx = uint8(i);
        }
        incomeRewardIndex = incomeIdx;
        oracle = c.oracle;
        ops = c.ops;
        currentToken = c.initialToken;
        _setBuyParams(params_);
        deployedAt = block.timestamp;
        weekEnd = RomeTime.nextDeadline(block.timestamp);
    }

    receive() external payable {}

    /// @notice Lets the vault hold Volta's creator NFT for $CAPITALE (its fee share then flows
    ///         here). Nothing can move it out again: the fee stream is locked to the city.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // ─────────────────────────── Settlement ───────────────────────────

    /// @notice Close every finished week (vote result + street pool) and the early-bird pool.
    function settle() external nonReentrant {
        _settle();
    }

    function _settle() internal {
        _ingest();
        if (!earlyBirdFinalized && block.timestamp >= earlyBirdEnd) _finalizeEarlyBird();
        for (uint256 i; i < MAX_WEEKS_PER_SETTLE && block.timestamp >= weekEnd; ++i) {
            _finalizeWeek();
        }
    }

    /// @dev Income held by the vault that is not reward tokens owed to buildings.
    function _incomeBalance() internal view returns (uint256 bal) {
        if (address(income) == address(0)) return address(this).balance;
        bal = income.balanceOf(address(this));
        if (incomeRewardIndex != NO_TOKEN) bal -= heldRewards[incomeRewardIndex];
    }

    /// @dev Split any income that arrived since the last call: 70 / 15 / 15.
    function _ingest() internal {
        uint256 known = residentsFunds + streetFunds + opsFunds;
        uint256 bal = _incomeBalance();
        if (bal <= known) return;
        uint256 fresh = bal - known;
        uint256 r = (fresh * RESIDENTS_BPS) / BPS;
        uint256 s = (fresh * STREET_BPS) / BPS;
        uint256 o = fresh - r - s;
        residentsFunds += r;
        streetFunds += s;
        opsFunds += o;
        totalTax += fresh;
        emit TaxReceived(fresh, r, s, o);
    }

    function _finalizeEarlyBird() internal {
        earlyBirdFinalized = true;
        uint256 n = earlyBirdCount;
        for (uint8 t; t < tokenCount; ++t) {
            uint256 amt = earlyBirdPool[t];
            if (amt == 0) continue;
            uint256 usd = earlyBirdPoolUsd[t];
            earlyBirdPool[t] = 0;
            earlyBirdPoolUsd[t] = 0;
            if (n == 0) {
                _distributeResidents(t, amt, usd);
            } else {
                uint256 inc = (amt * ACC) / n;
                accEarlyBird[t] += inc;
                accEarlyBirdUsd[t] += (usd * ACC) / n;
                carry[t] += amt - _used(inc, n);
                emit Distributed(t, amt, n);
            }
        }
        emit EarlyBirdFinalized(n);
    }

    function _finalizeWeek() internal {
        uint256 w = week;
        uint256[4] storage v = _votes[w];
        uint256 best;
        uint8 bestIdx;
        bool tie;
        for (uint8 i; i < tokenCount; ++i) {
            if (v[i] > best) {
                best = v[i];
                bestIdx = i;
                tie = false;
            } else if (v[i] == best && best > 0) {
                tie = true;
            }
        }
        if (best > 0 && !tie) currentToken = bestIdx;

        for (uint8 t; t < tokenCount; ++t) {
            if (streetPool[t] != 0) _distributeStreet(w, t);
        }

        week = w + 1;
        weekEnd = RomeTime.nextDeadline(weekEnd);
        emit WeekSettled(w, currentToken, weekEnd);
    }

    function _distributeStreet(uint256 w, uint8 t) internal {
        uint256 n = residents;
        if (n == 0) return; // nobody to pay: rolls over to next week
        uint256 amt = streetPool[t];
        uint256 usd = streetPoolUsd[t];
        streetPool[t] = 0;
        streetPoolUsd[t] = 0;

        if (n >= MAX_BUILDINGS) {
            // City complete: no more competition, shared city-wide.
            _distributeResidents(t, amt, usd);
            emit StreetWon(w, t, uint8((1 << districts) - 1), amt, n);
            return;
        }

        uint256[4] storage nb = _newBuilds[w];
        uint256 best;
        uint8 nd = districts;
        for (uint256 d; d < nd; ++d) {
            if (nb[d] > best) best = nb[d];
        }
        uint8 mask;
        uint256 count;
        for (uint8 d; d < nd; ++d) {
            // Most new buildings wins (ties share). Nobody built: every built district shares.
            bool wins = best > 0 ? nb[d] == best : districtResidents[d] > 0;
            if (wins) {
                mask |= uint8(1 << d);
                count += districtResidents[d];
            }
        }
        uint256 inc = (amt * ACC) / count;
        uint256 incUsd = (usd * ACC) / count;
        for (uint256 d; d < nd; ++d) {
            if (mask & (1 << d) != 0) {
                _accDistrict[d][t] += inc;
                _accDistrictUsd[d][t] += incUsd;
            }
        }
        carry[t] += amt - _used(inc, count);
        emit StreetWon(w, t, mask, amt, count);
    }

    function _distributeResidents(uint8 t, uint256 amt, uint256 usd) internal {
        amt += carry[t];
        usd += carryUsd[t];
        uint256 n = residents;
        if (n == 0) {
            carry[t] = amt;
            carryUsd[t] = usd;
            return;
        }
        uint256 inc = (amt * ACC) / n;
        uint256 incUsd = (usd * ACC) / n;
        accGlobal[t] += inc;
        accGlobalUsd[t] += incUsd;
        carry[t] = amt - _used(inc, n);
        carryUsd[t] = usd - _used(incUsd, n);
        emit Distributed(t, amt, n);
    }

    /// @dev Tokens set aside by an increment of `inc` (ACC-scaled) for `n` buildings, rounded UP:
    ///      each building's claim is floored separately but the sum of several floored
    ///      increments can exceed the floored total, so reserving the ceiling keeps the vault solvent.
    function _used(uint256 inc, uint256 n) internal pure returns (uint256) {
        return (inc * n + ACC - 1) / ACC;
    }

    // ─────────────────────────── NFT hook ───────────────────────────

    function onMint(uint256 id, uint8 district, bool earlyBird) external nonReentrant {
        if (msg.sender != address(nft)) revert NotNft();
        _settle();
        residentOf[id] = Resident({registered: true, earlyBird: earlyBird, district: district});
        residents += 1;
        districtResidents[district] += 1;
        _newBuilds[week][district] += 1;
        if (earlyBird) earlyBirdCount += 1;
        // A new building only earns from purchases made after it exists.
        for (uint8 t; t < tokenCount; ++t) {
            (_debt[id][t], _debtUsd[id][t]) = _entitlement(id, t);
        }
    }

    // ─────────────────────────── Buying ───────────────────────────

    /// @notice Buy this week's token with the accumulated income, if the rules allow it.
    ///         Anyone may call this (it also restarts an idle keeper).
    /// @return bought true if an order was executed
    function requestBuy() external nonReentrant returns (bool bought) {
        _settle();
        lastRequestAt = block.timestamp;
        BuyParams memory p = buyParams;
        if (block.timestamp < pausedUntil) {
            emit BuySkipped(SKIP_PAUSED);
            return false;
        }
        if (lastBuyAt != 0 && block.timestamp < lastBuyAt + p.minInterval) {
            emit BuySkipped(SKIP_TOO_SOON);
            return false;
        }
        uint256 pendingFunds = residentsFunds + streetFunds;
        if (pendingFunds < p.minOrder || pendingFunds == 0) {
            emit BuySkipped(SKIP_BELOW_MIN);
            return false;
        }
        uint256 amount = pendingFunds < p.maxOrder ? pendingFunds : p.maxOrder;
        uint256 forResidents = (amount * residentsFunds) / pendingFunds;
        uint8 t = currentToken;
        uint256 incomeUsd_ = oracle.incomeUsd();
        // Buying the income asset itself (VOLTA) is a 1:1 allocation: nothing to price-check.
        uint256 minOut = t == incomeRewardIndex
            ? amount
            : (expectedOut(t, amount, incomeUsd_) * (BPS - p.maxDeviationBps)) / BPS;
        uint256 usd = (amount * incomeUsd_) / (10 ** incomeDecimals);

        try this.executeBuy(t, amount, forResidents, minOut, usd) returns (uint256 out) {
            lastBuyAt = block.timestamp;
            emit Bought(week, t, amount, out, usd);
            bought = true;
        } catch (bytes memory reason) {
            pausedUntil = block.timestamp + p.rejectPause;
            emit BuyRejected(week, t, amount, minOut, reason);
        }
    }

    /// @dev Only callable by the vault itself (from requestBuy), so a failed swap or a price
    ///      check failure reverts this frame alone and leaves the income untouched.
    function executeBuy(uint8 t, uint256 amount, uint256 forResidents, uint256 minOut, uint256 usd)
        external
        returns (uint256 out)
    {
        if (msg.sender != address(this)) revert NotSelf();
        residentsFunds -= forResidents;
        streetFunds -= amount - forResidents;

        if (t == incomeRewardIndex) {
            out = amount; // the income asset is the reward: set it aside, no swap
        } else {
            out = _swap(t, amount, minOut);
        }
        heldRewards[t] += out;

        uint256 outRes = (out * forResidents) / amount;
        uint256 usdRes = (usd * forResidents) / amount;
        if (block.timestamp < earlyBirdEnd) {
            earlyBirdPool[t] += outRes;
            earlyBirdPoolUsd[t] += usdRes;
        } else {
            _distributeResidents(t, outRes, usdRes);
        }
        streetPool[t] += out - outRes;
        streetPoolUsd[t] += usd - usdRes;

        totalPurchases += 1;
        totalBought[t] += out;
        totalBoughtUsd += usd;
    }

    /// @dev Swap `amount` of income into reward token `t` through its whitelisted adapter.
    ///      The adapter can take at most `amount` (exact ETH value, or an exact allowance that
    ///      is reset afterwards) and must deliver at least `minOut`.
    function _swap(uint8 t, uint256 amount, uint256 minOut) internal returns (uint256 out) {
        ISwapAdapter a = adapters[t];
        if (address(a) == address(0)) revert NoAdapter();
        IERC20 token = tokens[t];
        uint256 before = token.balanceOf(address(this));
        if (address(income) == address(0)) {
            a.swap{value: amount}(address(0), address(token), amount, minOut, address(this));
        } else {
            income.forceApprove(address(a), amount);
            a.swap(address(income), address(token), amount, minOut, address(this));
            income.forceApprove(address(a), 0);
        }
        out = token.balanceOf(address(this)) - before;
        if (out < minOut || out == 0) revert PriceDeviation(out, minOut);
    }

    /// @notice Tokens a buy of `amountIn` income should return at the oracle reference price.
    function expectedOut(uint8 t, uint256 amountIn, uint256 incomeUsd_) public view returns (uint256) {
        uint256 tokenUsd_ = oracle.tokenUsd(address(tokens[t]));
        return (amountIn * incomeUsd_ * (10 ** tokenDecimals[t])) / (tokenUsd_ * (10 ** incomeDecimals));
    }

    /// @notice False once nothing was bought or requested for 24h: the keeper stops polling
    ///         until someone calls requestBuy().
    function schedulerActive() external view returns (bool) {
        uint256 last = lastBuyAt;
        if (lastRequestAt > last) last = lastRequestAt;
        if (deployedAt > last) last = deployedAt;
        return block.timestamp < last + IDLE_AFTER;
    }

    /// @notice Pay the accumulated 15% ops share to the ops address. Anyone may call.
    function payOps() external nonReentrant {
        _ingest();
        uint256 amt = opsFunds;
        if (amt == 0) revert NothingToPay();
        opsFunds = 0;
        if (address(income) == address(0)) {
            (bool ok,) = ops.call{value: amt}("");
            if (!ok) revert OpsTransferFailed();
        } else {
            income.safeTransfer(ops, amt);
        }
        emit OpsPaid(ops, amt);
    }

    /// @notice Pull the creator share credited to this vault in Volta's FeeEscrow and split
    ///         it as tax. Anyone may call (the keeper does, before each buy check).
    function collectCreatorFees() external nonReentrant returns (uint256 amount) {
        if (address(feeEscrow) == address(0)) revert BadConfig();
        uint256 before = _incomeBalance();
        feeEscrow.withdrawFees(address(income), address(this), false);
        amount = _incomeBalance() - before;
        emit CreatorFeesCollected(amount);
        _settle();
    }

    /// @notice Unwrap any WETH fee income into ETH so it can be split. Anyone may call.
    function unwrapWeth() external nonReentrant {
        if (address(weth) == address(0)) revert BadConfig();
        uint256 bal = IERC20(address(weth)).balanceOf(address(this));
        if (bal != 0) weth.withdraw(bal);
        _ingest();
    }

    // ─────────────────────────── Voting ───────────────────────────

    /// @notice One vote per building per week for next week's token (0-3). Mayor cannot vote.
    function vote(uint256[] calldata ids, uint8 token) external nonReentrant {
        if (token >= tokenCount) revert BadToken();
        _settle();
        uint256 w = week;
        for (uint256 i; i < ids.length; ++i) {
            _castVote(ids[i], w, token);
        }
        _votes[w][token] += ids.length;
    }

    /// @notice Vote with every building the caller owns that has not voted this week.
    function voteAll(uint8 token) external nonReentrant returns (uint256 n) {
        if (token >= tokenCount) revert BadToken();
        _settle();
        uint256 w = week;
        uint256 bal = nft.balanceOf(msg.sender);
        for (uint256 i; i < bal; ++i) {
            uint256 id = nft.tokenOfOwnerByIndex(msg.sender, i);
            if (id == 0 || lastVotedWeek[id] == w + 1) continue;
            lastVotedWeek[id] = w + 1;
            emit Voted(w, id, token);
            ++n;
        }
        _votes[w][token] += n;
    }

    function _castVote(uint256 id, uint256 w, uint8 token) internal {
        if (id == 0) revert MayorExcluded();
        if (nft.ownerOf(id) != msg.sender) revert NotBuildingOwner(id);
        if (lastVotedWeek[id] == w + 1) revert AlreadyVoted(id);
        lastVotedWeek[id] = w + 1;
        emit Voted(w, id, token);
    }

    // ─────────────────────────── Claims ───────────────────────────

    function claim(uint256 id) external nonReentrant {
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        _claim(ids);
    }

    function claimMany(uint256[] calldata ids) external nonReentrant {
        _claim(ids);
    }

    /// @dev Pays every reward token at once. A token whose transfer fails is skipped and stays
    ///      claimable.
    function _claim(uint256[] memory ids) internal {
        _settle();
        for (uint256 j; j < ids.length; ++j) {
            if (ids[j] == 0) revert MayorExcluded();
            if (nft.ownerOf(ids[j]) != msg.sender) revert NotBuildingOwner(ids[j]);
        }
        for (uint8 t; t < tokenCount; ++t) {
            uint256 total;
            for (uint256 j; j < ids.length; ++j) {
                (uint256 owed,) = _owed(ids[j], t);
                total += owed;
            }
            if (total == 0) continue;
            heldRewards[t] -= total;
            if (!tokens[t].trySafeTransfer(msg.sender, total)) {
                heldRewards[t] += total;
                emit ClaimSkipped(msg.sender, t, total);
                continue;
            }
            for (uint256 j; j < ids.length; ++j) {
                uint256 id = ids[j];
                (uint256 owed, uint256 owedUsd) = _owed(id, t);
                if (owed == 0) continue;
                _debt[id][t] += owed * ACC;
                _debtUsd[id][t] += owedUsd * ACC;
                claimedUsd[id] += owedUsd;
                emit Claimed(id, msg.sender, t, owed, owedUsd);
            }
        }
    }

    // ─────────────────────────── Views ───────────────────────────

    function _entitlement(uint256 id, uint8 t) internal view returns (uint256 amt, uint256 usd) {
        Resident memory r = residentOf[id];
        amt = accGlobal[t] + _accDistrict[r.district][t];
        usd = accGlobalUsd[t] + _accDistrictUsd[r.district][t];
        if (r.earlyBird) {
            amt += accEarlyBird[t];
            usd += accEarlyBirdUsd[t];
        }
    }

    function _owed(uint256 id, uint8 t) internal view returns (uint256 amt, uint256 usd) {
        if (!residentOf[id].registered) return (0, 0);
        (uint256 e, uint256 eUsd) = _entitlement(id, t);
        amt = (e - _debt[id][t]) / ACC;
        usd = (eUsd - _debtUsd[id][t]) / ACC;
    }

    /// @notice Claimable amount of reward token `t` for building `id` (as of the last settlement).
    function pending(uint256 id, uint8 t) external view returns (uint256 amt) {
        (amt,) = _owed(id, t);
    }

    function pendingAll(uint256 id) external view returns (uint256[] memory amts) {
        amts = new uint256[](tokenCount);
        for (uint8 t; t < tokenCount; ++t) {
            (amts[t],) = _owed(id, t);
        }
    }

    /// @notice USD value of everything claimable by `id`, at purchase-time prices.
    function pendingUsd(uint256 id) external view returns (uint256 usd) {
        for (uint8 t; t < tokenCount; ++t) {
            (, uint256 u) = _owed(id, t);
            usd += u;
        }
    }

    function levelOf(uint256 id) external view returns (uint256) {
        return levelForUsd(claimedUsd[id]);
    }

    /// @notice L1 $0, L2 $5, L3 $20, L4 $50, L5 $100, then +1 level per extra $50 (no cap).
    function levelForUsd(uint256 usd) public pure returns (uint256) {
        if (usd < 5e18) return 1;
        if (usd < 20e18) return 2;
        if (usd < 50e18) return 3;
        if (usd < 100e18) return 4;
        return 5 + (usd - 100e18) / 50e18;
    }

    function votesOf(uint256 w) external view returns (uint256[] memory) {
        return _firstN(_votes[w], tokenCount);
    }

    function newBuildsOf(uint256 w) external view returns (uint256[] memory) {
        return _firstN(_newBuilds[w], districts);
    }

    function _firstN(uint256[4] storage a, uint8 n) internal view returns (uint256[] memory out) {
        out = new uint256[](n);
        for (uint256 i; i < out.length; ++i) {
            out[i] = a[i];
        }
    }

    function hasVoted(uint256 id) external view returns (bool) {
        return lastVotedWeek[id] == week + 1;
    }

    function accDistrict(uint8 d, uint8 t) external view returns (uint256) {
        return _accDistrict[d][t];
    }

    // ─────────────────────────── Admin (48h timelock) ───────────────────────────

    function setOracle(ICapitaleOracle oracle_) external onlyOwner {
        if (address(oracle_) == address(0)) revert BadConfig();
        oracle = oracle_;
        emit OracleSet(address(oracle_));
    }

    function setAdapter(uint8 t, ISwapAdapter adapter) external onlyOwner {
        if (t >= tokenCount) revert BadToken();
        adapters[t] = adapter;
        emit AdapterSet(t, address(adapter));
    }

    function setBuyParams(BuyParams calldata p) external onlyOwner {
        _setBuyParams(p);
    }

    function setOps(address ops_) external onlyOwner {
        if (ops_ == address(0)) revert BadConfig();
        ops = ops_;
        emit OpsSet(ops_);
    }

    function _setBuyParams(BuyParams memory p) internal {
        if (p.minOrder == 0 || p.maxOrder < p.minOrder || p.maxDeviationBps == 0 || p.maxDeviationBps >= 2_000) {
            revert BadConfig();
        }
        buyParams = p;
        emit BuyParamsSet(p);
    }
}
