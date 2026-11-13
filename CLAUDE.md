# CAPITALE on VOLTA (Elysium) — project brief for Claude Code

This repo is the **Volta / Elysium instance** of Capitale. The Base / STONKEX version lives
in `juanantin/capitale` and is kept for later; do not merge the two.

Capitale is a replica of **Stockopolis ("Stock City")** with a map of Italy. Here it runs on
**Elysium** (chain id 99901, gas in HYPE) and launches on **Volta** (volta.family), a
Uniswap v4 launchpad. The owner, Juan, is an animation director with little Solidity
experience: work autonomously, explain decisions in plain language, and ask only when a
decision is genuinely his.

**The spec is `docs/stockopolis-reference.md`. Copy every mechanic in it.** This brief
only lists what changes. When in doubt, do what Stockopolis does.

## What changes vs Stockopolis
| Stockopolis (BNB Chain) | Capitale on Volta (Elysium) |
|---|---|
| BNB | $VOLTA is the city's income asset; gas is HYPE |
| Flap tax token, 1% buy + 1% sell | $CAPITALE launched on Volta paired with $VOLTA. Volta: swap fee 1–5% (chosen at launch), 70% to the launch's split, 30% to Volta. Capitale sends 100% of its split to the creator; the vault holds the creator NFT, so the creator share (in VOLTA) is the city tax |
| Flap VaultEx + Flap scheduled service | Vault pulls fees from Volta's FeeEscrow (`collectCreatorFees`, anyone) + whitelisted swap adapters + keeper bot with the same rules |
| 4 stock tokens | 3 reward tokens: VOLTA, SENT, VOID (decided by Juan). Buying VOLTA = keep it 1:1, no swap |
| 4 Chinese-named streets, one stock each | 4 Italian cities (table below), all earning all 3 tokens |
| Chainlink / DEX average reference price | Volta's pool TWAPs (Oracle `twapTick`) and price calculators |
| Beijing time weekly deadline | Sunday 20:00 Rome time |

## Elysium / Volta facts (from volta.family/docs, verify before mainnet)
- Chain id 99901, RPC https://rpc.elysium.kinetiq.xyz (Volta's: rpc.volta.family), explorer https://elysium.kinetiq.xyz
- $VOLTA 0x0f79931689Af199e7CF868ed1107bBA2C83c68f7 · SENT 0xA713a15b85Cab304F9e2fbc649440B5e3AB8a8D4 · VOID 0xD31B21Cb80E431AC996269deC31A40fCf048B77f (all 18 decimals)
- Volta PositionManager 0x3aB88DDc3CF2A012af88B60828edb4553697E5dC, Creator NFT 0xac466Ee5CEdD012eB750DBDA0B935F8B997402c7, FeeEscrow 0x3D36Beb546E451584736957F97E7EE9D2aCbD9a5 (`withdrawFees(token, recipient, unwrap)`), Oracle 0xa2A5eBE297a141160ca5c513c74fD43cB2c09B2e, UniversalRouter 0xA13f7611115752DEB2B13813BDDE16A5073e4b45, V4Quoter 0x379F556c5a748BD7Cc9baF0F7A344094Ac1814f5
- SENT trades mainly on the VOLTA/SENT Volta pool (~$13k liquidity, Nov 2026): keep orders small (≲ $100) or the 4% check rejects them. VOID trades against HYPE (~$37k).

## Districts (locked)
| City | Ink | Landmark |
|---|---|---|
| Milano | gold #d9b45a | Duomo spires |
| Roma | orange #e0874f | Colosseum |
| Napoli | rose #e0648f | Vesuvius + pizzeria |
| Venezia | blue #5b8def | Campanile + gondola |

Decided by Juan: 4 cities, 3 reward tokens. Every city earns the same tokens (VOLTA, SENT,
VOID); the weekly vote picks which one is bought. A city only sets a building's plot and
its team in the weekly street race. City name BIG on each banner, palazzi count small; the
city leading this week's street race gets a "LEADING" tag; "this week's token" is shown in
the stats bar.
The contracts take the city count and the token list at deploy (max 4 each).
Torino, Firenze and Sicilia art exists for possible later cities.

## Mechanics to implement (from the reference, with Capitale values)
- **Tax:** 100% of the vault's fee income: 70% buys the week's token for residents, 15%
  buys it for the weekly street pool, 15% stays in VOLTA for operations (2-of-3 multisig).
- **Buying:** accumulate, buy at a minimum order size, cap per order, one order at a time,
  minimum interval, price check against the reference with a max deviation (Stockopolis:
  0.5 BNB / 3 BNB / 10 min / 4% / 6h pause / 24h idle pause). Scale the ETH thresholds to
  similar USD values (in VOLTA, sized to each pool's liquidity) and keep them as parameters. Anyone can call requestBuy().
- **Buildings (CityNFT → CapitaleNFT):** 3,000 + Mayor #0 at deploy; mint(district, style,
  inviter, maxPrice); 4 cities × 3 styles, permanent; burn to dead address; sequential
  numbers; plots per district nearest-to-farthest from the centre; freely transferable;
  rewards and height follow the NFT; vote lock after transfer within the week; invite
  decorations only. Non-upgradeable. Name "Capitale", symbol "PALAZZO", no royalties.
  tokenURI returns name, image and attributes (district, style, level, invites).
- **Pricing (CityPricing → CapitalePricing):** early bird 300 units at 40 USD for 6h,
  then tiers 52 / 68 / 88 / 120 USD at #800 / #1500 / #2300 / #3000; tokens to burn =
  USD target / price; early-bird reference price (drops follow instantly, rises after 60s);
  afterwards the lower of spot and a 30-60 min TWAP; revert above the builder's max.
- **Dividends (CityVault → CapitaleVault):** residents' share split equally across
  buildings existing at purchase time; early-bird pool shared among early-bird buildings
  when that period ends; claim / claimMany pay all tokens at once, skipping any that
  fail to transfer; pendingUsd(id).
- **Height:** cumulative claimed USD at purchase-time value; L1 $0, L2 $5, L3 $20, L4 $50,
  L5 $100, then +1 level per extra $50, no cap. Cosmetic only.
- **Weekly vote:** one vote per building per week (not Mayor); vote(ids, token) /
  voteAll(token); most votes picks next week's token; no votes or tie = unchanged.
- **Street competition:** the district with the most new buildings this week wins the 15%
  street pool, split among its buildings; ties share; nobody built = all built districts
  share; after 3,000 buildings, shared city-wide.
- **Settlement:** lazy settle() on the next vote/build/buy/claim after the deadline;
  anyone may call it; unspent tax rolls over.
- **Permissions:** no withdrawal backdoor; multisig only receives the 15% ops share;
  pricing/protection changes behind a 48h timelock; NFT not upgradeable. Prefer a
  non-upgradeable vault too (we have no Flap guardian); if upgradeable, timelock it.

## Visual style (locked): Volta's engraved-banknote look
Dark theme from volta.family: void #041510, plate #08201a, forest #0b2a21, mint #80e3ba,
ivory #e7f5ed, muted #94b7a7, border #25463a. Cormorant Garamond (display), Geist (text),
Geist Mono (uppercase, letter-spaced labels). Square corners, thin borders, guilloche
rosettes, mint "rule-after" lines. The map is an engraving: forest land with mint
coastline contours and hatching, mint-line buildings with hatched shade faces, city inks
(Milano gold, Roma orange, Napoli rose, Venezia blue) on roofs and rosettes. Token colours:
VOLTA mint, SENT amber, VOID lavender. Motion still matters (pop-in, floors growing,
fireworks, boats, smoke) — keep it subtle and engraved. No emojis in the UI.

## Assets
The toy pastel sprites below do NOT match this instance's engraved look; the site draws its
own engraved art and does not fetch them. New art, if any, should be engraved mint-line
work on forest green (like Volta's frieze).
`assets/manifest.json` lists the older generated art: base map, landmark sprites, a house sheet
and two final mockups as the style reference. Download into `assets/raw/`, remove white
backgrounds, slice the house sheet, export WebP.
Now also included: 3 building styles per district (12 sprites, transparent backgrounds),
the Mayor's building (#0) and a 3-piece floor kit. Build height procedurally (ground
floor + N middle floors + roof, tinted per district) so levels have no cap. Decide in
the frontend how a level shows on a styled building (e.g. extra floors stacked under the
style's top, or the floor kit for L2+). Check transparency edges and stacking alignment;
list any sprite that needs regenerating for Juan.
If the base map's outline of Italy is inaccurate, rebuild the island from real geodata
(Natural Earth via d3-geo) styled to match.

## Frontend
Copy the Stockopolis screens: token header (name, CA, "via Volta · Elysium"); city stats
(residents x/3000, total city tax, total purchases, this week's token); the map with
pan/zoom; tabs Build, My Palazzo, Town Hall (vote), Rankings (street competition and
tallest buildings), Treasury, White Paper, Il Sindaco; build flow (district → style →
inviter number → approve once → build with max burn); My Palazzo (pending USD, claim,
level, vote status). All text is HTML/SVG overlay. Next.js + wagmi/viem + PixiJS. Must
run smoothly on phones. Write Capitale's own white paper page mirroring Stockopolis's.

## Existing code
`contracts/Capitale.sol` is an older single-contract draft. Reuse its dividend
accounting, burn-to-build and invite logic, but rebuild as CapitaleNFT, CapitalePricing and
CapitaleVault per the reference. Its fixed-weight split is obsolete: Capitale uses the
weekly vote.

## Build order (status)
1. Contracts + tests — done (104 tests incl. invariants; ERC-20 income, FeeEscrow collection).
2. Price reading on Elysium: oracle from Volta's pool TWAPs (`Oracle.twapTick`) and price
   calculators for VOLTA/SENT/VOID; $CAPITALE spot/TWAP from its Volta pool. TODO.
3. Swap adapters through Uniswap's UniversalRouter (VOLTA→SENT on the VOLTA/SENT pool;
   VOLTA→HYPE→VOID). TODO.
4. Keeper bot (hourly: collectCreatorFees, requestBuy, settle). TODO.
5. Frontend — done for preview + test mode (test city deployed from the browser).
6. Slither/Aderyn + auditor checklist; real launch on Volta with the creator NFT sent to the
   vault (irreversible) — only with Juan's explicit go.

## Open questions
- Swap fee for $CAPITALE on Volta (1–5%) and anti-snipe settings: Juan's call at launch.
- Buy sizes per token vs pool liquidity (SENT pool is thin).
- Hosting: capitale.city (currently on the old Vercel project) moves to this project.
- Juan asked whether NFTs make sense on Elysium: they work (Volta's creator NFT is one);
  there may be no marketplace yet. Kept for now; alternative is non-transferable buildings.

## Rules
- Never ask for, print or store private keys or seed phrases. Use a gitignored `.env` or a
  browser/hardware wallet.
- Never deploy to mainnet or send real funds without Juan's explicit confirmation.
- Recommend a professional audit before mainnet; tests do not replace it.
- Invites stay cosmetic. Never add profit-sharing referrals.
