# CAPITALE on MONTRA (Elysium) — project brief for Claude Code

This repo (`juanantin/capitale-volta`, the name is historical) is **Capitale on Montra**: five
cities of Italy on **Elysium** (chain id 99901, gas in HYPE), launched on **Montra**
(montramarkets.xyz), Elysium's launchpad. Related projects, never merged with this one:
- branch `launch-volta`: this same game as it was for a launch on Volta (Nov 2026 backup);
- branch `theme-volta`: the Volta engraved look; branch `theme-riviera`: the dropped Riviera look;
- `juanantin/vice`: VICE, the Miami version, launched on Volta (Nov 2026). Its fixes were ported
  here (see "From VICE"); never push to it from this project;
- `juanantin/capitale`: the old Base / STONKEX version.

Capitale is a replica of **Stockopolis ("Stock City")**. In the product the name is always
written in caps, like the token: CAPITALE and $CAPITALE (Juan, Nov 2026; `GAME.name`). The owner, Juan, is an animation
director with little Solidity experience: work autonomously, explain decisions in plain
language, and ask only when a decision is genuinely his.

**The spec is `docs/stockopolis-reference.md`. Copy every mechanic in it.** This brief
only lists what changes. When in doubt, do what Stockopolis does. `docs/DECISIONS.md` logs how
ambiguities were resolved.

## What changes vs Stockopolis
| Stockopolis (BNB Chain) | Capitale on Montra (Elysium) |
|---|---|
| BNB | HYPE is the city's income asset (native) and gas |
| Flap tax token, 1% buy + 1% sell | $CAPITALE launched on Montra paired with HYPE (Uniswap v4 pool + Montra's hook, whole supply locked as liquidity). Fee tier 1/2/3/5/10% (Juan's call at launch); 0.4% of each trade goes to Montra, the creator side to the pool's recipient. The recipient is the vault, so the creator side (in HYPE) is the city tax |
| Flap VaultEx + Flap scheduled service | `collectCreatorFees()` claims from Montra's LaunchHook (`claim(poolId, vault)`, anyone may trigger) + `claimHolderRewards()` + whitelisted swap adapters + keeper bot |
| 4 stock tokens | 5 reward tokens: Montra's top five by market cap, minus EACCVIDIA (decided by Juan) |
| 4 Chinese-named streets, one stock each | 5 Italian cities, one token each, fixed (no weekly vote; decided by Juan) |
| Chainlink / DEX average reference price | Montra pool prices; Montra has no TWAP oracle, so ours must build one (TODO) |
| Beijing time weekly deadline | Sunday 20:00 Rome time (street race only) |

## Elysium / Montra facts (from montramarkets.xyz/docs and its API, Nov 2026; verify before launch)
- Chain id 99901, RPCs https://rpc.volta.family (CORS, used by the site and keeper; it served
  VICE well) and https://rpc.elysium.kinetiq.xyz; Montra has its own RPC (docs/rpc).
- Montra reads every address from its registry `0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7`
  (`get(name)`, `hooks()`). Config API: https://api.montramarkets.xyz/api/config. On 24 Nov 2026:
  factory 0x38d3ef3a06d18fa3286fb5deafe611be725fcd15, launch hook
  0x6b1216a40b65c83e9c9e18a562c446697b8cf8ec, router 0xc6e9a8e1a99023b67067b8a3605403b8d7b3a157,
  lens 0xb4c202910c40c3a83f6c55683460790aaec487d4, PoolManager 0xe2e105d3f7209a9da11f83ccf3e7398a753823f1,
  quote registry 0x91756e3174d58482fbe59e1162573a69519c60eb, Universal Router
  0xa13f7611115752deb2b13813bdde16a5073e4b45, quoter 0x379f556c5a748bd7cc9baf0f7a344094ac1814f5.
- Fees: claimed by the pool's recipient with `LaunchHook.claim(bytes32 poolId, address to)`;
  the recipient is set at launch (`feeRecipients`) or handed on with
  `updateRecipient(poolId, newRecipient)` (no accept step). Only a single-address recipient can
  lower the fee (to its tier floor); the vault never does. Fees are in the pool's quote asset.
- Holder rewards: tokens launched with "holders" as their route pay holders in the quote asset;
  a contract holder must call the token's `claimRewards()` itself (the vault does, in
  `claimHolderRewards()`).
- Docs as one file: https://montramarkets.xyz/llms-full.txt. ABIs: /docs/abis.json.

## Cities and tokens (decided by Juan, Nov 2026)
Index order matches the contracts and tests.

| # | City | Ink | Landmark | Earns | Token address | Pair |
|---|---|---|---|---|---|---|
| 0 | Milano | gold #d9b45a | Duomo spires | LiquidV | 0xd12609ddb1cd18280c7c14fb2cb5091cfea37f2d | HYPE |
| 1 | Roma | orange #e0874f | Colosseum | MONTRA | 0x063f7cc5339f92a5fd7baf3d22233044fda1f327 | KNTQ |
| 2 | Napoli | rose #e0648f | Vesuvius + pizzeria | CHAMELEON | 0xd662d66ec991a3eae4ecbda34327264c53d4cf38 | HYPE |
| 3 | Venezia | blue #5b8def | Campanile + gondola | EACCAT | 0x32193afd14c53f12c45a4c04eca9f7ba98e3ec71 | HYPE |
| 4 | Palermo | green #5fc48a | Cattedrale (red domes, palms) | NUM | 0xe9c952cd198ff412113a465d34ff2c233f6f4ca1 | HYPE |

Vault token order: MONTRA, LiquidV, EACCAT, CHAMELEON, NUM (indexes 0-4); `cityTokens` =
[1, 0, 3, 2, 4]. The city→token pairing is a deploy value (`cityTokens`) and `earns` in
`web/lib/config.ts`; changing it needs no code change. MONTRA trades against KNTQ, so its
swap route is HYPE → KNTQ → MONTRA. Each order splits the residents' share across cities by
building count (same value per building) and buys each city's token. The street share waits in
HYPE until the deadline names the winner, then is bought in the winner's token. Banner: city
name BIG, palazzi count small, the city's token chip; the street-race leader gets "LEADING";
the stats bar shows "Leading this week". The contracts take the city count, the token list and
the token per city at deploy (max 5 each).

## Mechanics (from the reference, with Capitale values)
- **Tax:** 100% of the vault's fee income: 70% buys each city's token for its residents,
  15% for the weekly street pool (bought in the winner's token after the deadline), 15%
  stays in HYPE for operations (2-of-3 multisig).
- **Buying:** accumulate, buy at a minimum order size, cap per order, one order at a time,
  minimum interval, price check against the reference with a max deviation (Stockopolis:
  0.5 BNB / 3 BNB / 10 min / 4% / 6h pause / 24h idle pause). Size the HYPE thresholds to each
  pool's liquidity (Montra pools are small) and keep them as parameters. Anyone can call
  requestBuy(). Orders run with a fixed gas budget (BUY_GAS, 4M) so a low-gas caller can't
  trigger a rejection and a 6h pause (from VICE).
- **Buildings (CapitaleNFT):** 3,000 + Mayor #0 at deploy; mint(district, style, inviter,
  maxPrice); 5 cities × 3 styles, permanent; burn to dead address; sequential numbers; plots
  per city nearest-to-farthest from the landmark; freely transferable; rewards and height
  follow the NFT; invite decorations only. Non-upgradeable. Name "CAPITALE", symbol "PALAZZO",
  no royalties. tokenURI returns name, image and attributes (city, style, level, invites).
- **Pricing (CapitalePricing):** early bird 300 units at 40 USD for 6h, then tiers 52 / 68 /
  88 / 120 USD at #800 / #1500 / #2300 / #3000; tokens to burn = USD target / price;
  early-bird reference price (drops follow instantly, rises after 60s); afterwards the lower
  of spot and a 30-60 min TWAP; revert above the builder's max.
- **Dividends (CapitaleVault):** each city's share split equally across its buildings existing
  at purchase time; early-bird pools per city shared among that city's early-bird buildings
  when the window ends; claim / claimMany pay all tokens at once, skipping any that fail to
  transfer; pendingUsd(id).
- **Holder rewards:** `claimHolderRewards()` (anyone) claims the HYPE that held reward tokens
  pay their holders; it becomes new city tax.
- **Height:** cumulative claimed USD at purchase-time value; L1 $0, L2 $5, L3 $20, L4 $50,
  L5 $100, then +1 level per extra $50, no cap. Cosmetic only.
- **No weekly vote** (Juan, Nov 2026): every city's token is fixed.
- **Street race:** the city with the most new buildings this week wins the 15% street pool,
  split among its buildings; ties share per building; nobody built = all built cities share;
  after 3,000 buildings, shared city-wide.
- **Settlement:** lazy settle() on the next build/buy/claim after the deadline; anyone may
  call it; unspent tax rolls over.
- **Permissions:** no withdrawal backdoor; multisig only receives the 15% ops share;
  oracle/adapter/buy-rule changes behind a 48h timelock; NFT and vault not upgradeable.

## Visual style: Montra (main, Juan Nov 2026)
Follow Montra's design: near-black layers (#050505, #0a0a0a, #101010, #161616, #1e1e1e),
off-white text #f2f2f2, muted #a3a3a3, hairlines #1f1f1f / #2c2c2c, a metallic gold accent
(#e9b64a; gradient #ffdc8a → #efbe4c → #d6a12a, ink #110c02), sharp 2px corners, a faint
diagonal sheen on cards. Type: an editorial serif for display (Instrument Serif standing in
for Montra's licensed "Editorial"), Inter for text, JetBrains Mono for uppercase labels. Dark
by default; a paper-white light theme. The map is an engraving in gold on black (paper in
light): coastline contours, hatching, 1° graticule, guilloche ribbons, rosettes, compass,
city inks on roofs; every buy shows rings and sparkles over the cities that got the token.
No Riviera / caper / neon look. No emojis in the UI. App icon: gold rosette and palazzo on
black (`web/scripts/build-icon.mjs`).

## From VICE (launched on Volta, Nov 2026): what was ported
Contracts: the BUY_GAS fixed gas budget for orders (+ test). Site: live-city mode read from
the chain (wallet as fallback RPC), the "Your next move" guide, live feed + event cards (and
a replay of recent events on arrival), share links `?palazzo=N`, send a palazzo to another
wallet, the wallet's token balance on its button, open-in-wallet-app on phones, Treasury
buttons (collect fees, claim holder rewards, buy). Keeper: `keeper/keeper.mjs` + the GitHub
workflow (an outside timer like cron-job.org is more reliable than GitHub's schedule).
Also ported: the NFT image restyled to the site's look (VICE did the same for Miami),
`cleanUrls` in `vercel.json`, a 6M gas limit on the site's Buy button (wallets under-estimate).
Audited 24 Nov 2026: every VICE change since the copy was checked; the rest is Miami/VICE
branding, Miami map code, brand images, or Volta-only.
Not ported yet (Volta-specific, need Montra versions): price oracle, swap adapter, launch
wizard `/launch`, `script/DeployCity.s.sol`, `LAUNCH.md`, fork tests.

### VICE's launch lessons to apply here
- Montra pools live in the same Uniswap v4 PoolManager as Volta's
  (0xe2e105d3f7209a9da11f83ccf3e7398a753823f1): VICE's `src/volta/TickPrice.sol` (+ its
  tests) and much of `VoltaSwapAdapter` (direct PoolManager swaps via the unlock callback) can
  be reused for Montra; its `ViceOracle` can't (it reads Volta's own Oracle, Montra has none).
- The vault's reference price for a reward token must include the pool fees on its route
  (Montra fee tiers 1-10% per hop; MONTRA is two hops via KNTQ), so the 4% band measures
  slippage only. Otherwise every buy is rejected.
- HYPE/USD: a stored reference moved by a keeper `poke()` (≥5 min apart, ±2% per step), so
  flash manipulation can't move build prices.
- Build-price TWAP: VICE settled for Volta's 10-minute window; the spec asks 30-60 min.
- Launch order: the city must be the fee recipient before trading starts, or the first fees go
  to the launch wallet. On Montra the token and pool ids are predictable before launch
  (token = clone(keccak(sender, salt)); pool id from its PoolKey), so the vault can be deployed
  first and named in `feeRecipients` at launch; otherwise `updateRecipient` right after.
- Ownership: the vault is owned by the 48h timelock from deployment; pricing hands ownership to
  the timelock after launch (accepted 48h later).
- Default buy sizes that worked: $20 minimum, $150 maximum per order (in HYPE at deploy).
- The keeper signs locally and sends 30% more gas than estimated; an outside timer
  (cron-job.org) starts it every 10 minutes.
- Some browsers can't reach the public RPC: the site falls back to the player's wallet.

## Frontend
Stockopolis screens: token header (name, CA, "via Montra · Elysium"); city stats (residents
x/3000, city tax in HYPE, purchases, leading city); the map with pan/zoom; tabs Build, My
Palazzi, Live, Rankings, Treasury, White Paper, Il Sindaco. Build flow: city → style →
inviter number → approve once → build with max burn. All text is HTML/SVG overlay. Next.js 16
static export + wagmi/viem + PixiJS 8 + d3-geo. Must run smoothly on phones. Preview with
sample data; hidden test lab (triple-tap the "Sample data" chip) deploys a test city on
Elysium with test tokens. `LIVE` / `PRELAUNCH` in `web/lib/config.ts` switch to the real city.

## Build order (status)
1. Contracts + tests — done for Montra (102 tests incl. fuzz and invariants).
2. Price reading on Elysium for Montra pools: TODO. Montra has no TWAP; build an oracle that
   stores observations (keeper `poke()`, clamped steps) for $CAPITALE, HYPE/USD and the five
   tokens (MONTRA via KNTQ), like VICE's `ViceOracle`.
3. Swap adapter through Montra's router (HYPE → token; HYPE → KNTQ → MONTRA): TODO.
4. Keeper — ported (needs a live vault).
5. Frontend — done (preview, test lab, live mode); launch wizard to port once 2-3 exist.
6. Fork tests against live Elysium, a rehearsal launch, then the real launch on Montra with
   the vault as fee recipient — only with Juan's explicit go.

## Open questions
- Fee tier for $CAPITALE (1/2/3/5/10%) and anti-snipe window: Juan's call at launch.
- Buy sizes per token vs pool liquidity (Montra pools are small).
- Hosting: capitale.city should point at this repo's Vercel project.
- X account for Capitale (`GAME.x` in config; links appear when set).
- Audit: Juan decided not to audit VICE; ask again for Capitale before launch.

## Toolchain notes (cloud sessions)
- Foundry from npm (`@foundry-rs/forge`) with a solc-js shim when GitHub downloads are blocked;
  OpenZeppelin v5.4.0 and forge-std are submodules (`git submodule update --init`). After
  contract changes: `forge build`, then `node web/scripts/export-contracts.mjs`.
- `npm run build` in `web/` may stop once with a Next.js security-upgrade notice; running it
  again completes. Ask Juan before running Next's upgrade command.
- Playwright screenshots of the PixiJS map: launch Chromium with
  `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.

## Rules
- Never ask for, print or store private keys or seed phrases. Use a gitignored `.env` or a
  browser/hardware wallet.
- Never deploy to mainnet or send real funds without Juan's explicit confirmation.
- Recommend a professional audit before mainnet; tests do not replace it.
- Invites stay cosmetic. Never add profit-sharing referrals.
- Never push to `juanantin/vice` or `juanantin/capitale` from this project.
