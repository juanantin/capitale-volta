# Capitale on Montra (Elysium)

An engraved city of Italy on Elysium: burn $CAPITALE (launched on Montra, paired with HYPE) to
build a palazzo in Milano, Roma, Napoli, Venezia or Palermo. Each city earns one of Montra's
top tokens (LiquidV, MONTRA, CHAMELEON, EACCAT, NUM), bought with the city tax; claiming grows
your building. Replica of Stockopolis: see `CLAUDE.md` (brief), `docs/stockopolis-reference.md`
(spec) and `docs/DECISIONS.md` (how ambiguities were resolved).

Other versions: branch `launch-volta` (this game for Volta), `juanantin/vice` (VICE, the Miami
version on Volta), `juanantin/capitale` (the old Base version).

## Contracts (`src/`)
| Contract | What it does |
|---|---|
| `CapitaleNFT` | Buildings (ERC-721 "PALAZZO"), 3,000 + Mayor #0, burn-to-build |
| `CapitalePricing` | Early bird / tier USD prices, $CAPITALE price rules |
| `CapitaleVault` | Tax split, buys, dividends, height, street race; claims Montra fees and holder rewards |
| `libraries/RomeTime` | Sunday 20:00 Rome deadline with daylight saving |
| `testnet/TestKit` | Test tokens, price feed, swap and a Montra hook stand-in for the test lab |

## Develop
```sh
forge build
forge test            # unit + fuzz + invariant tests
node web/scripts/export-contracts.mjs   # after contract changes
```

## Website (`web/`)
Next.js + PixiJS, static export. Preview with sample data; a hidden test lab (triple-tap the
"Sample data" chip) deploys a test city on Elysium with test tokens.
```sh
cd web && npm install && npm run dev
```
On Vercel it deploys as-is: `vercel.json` builds `web/` and serves the static export (`web/out`).

## Keeper (`keeper/`)
Claims fees and holder rewards, settles the week, starts buys, pays ops. Runs from the GitHub
workflow `.github/workflows/keeper.yml` once a live vault exists (secret `KEEPER_PRIVATE_KEY`).
`DRY_RUN=1 node keeper/keeper.mjs` only reports.

Status: **not audited**. Do not deploy to mainnet without Juan's go; a professional audit is recommended.
