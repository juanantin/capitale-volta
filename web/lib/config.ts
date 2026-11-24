// Static facts about Capitale on Elysium: five cities of Italy, five reward tokens (Montra's
// top tokens). $CAPITALE launches on Montra paired with HYPE; the creator side of its pool's fee
// (in HYPE) is the city tax. Contract addresses are filled in after the launch.

/** The game's name, ticker and words for a building. Change them here and the whole site follows.
 *  The name is written in caps everywhere, like the token (Juan, Nov 2026). (The NFT's name
 *  "CAPITALE" and symbol PALAZZO are strings in src/CapitaleNFT.sol.) */
export const GAME = {
  name: "CAPITALE",
  /** Shown as $TICKER. */
  ticker: "CAPITALE",
  tagline: "Italy · on Montra",
  building: "palazzo",
  buildings: "palazzi",
  /** Social handle of the in-game news account. */
  news: "@capitale.news",
  /** The official X account (linked in the header), once there is one. */
  x: null as string | null,
  xHandle: null as string | null,
};
export const TICKER = `$${GAME.ticker}`;

/** A city on the map. A city sets a building's plot, its team in the weekly street race and
 *  the token it earns. */
export type DistrictId = 0 | 1 | 2 | 3 | 4;

export interface District {
  id: DistrictId;
  city: string;
  place: "milano" | "roma" | "napoli" | "venezia" | "palermo";
  landmark: string;
  colour: string; // main colour
  light: string;
  dark: string;
  styles: [string, string, string];
  /** The token this city's buildings earn (fixed at deploy, `cityTokens`). */
  earns: TokenId;
  /** The city's crew and its social handle (feed posts). */
  crew: string;
  handle: string;
}

// Index order matches the contracts (Milano 0 … Palermo 4).
export const DISTRICTS: District[] = [
  { id: 0, city: "Milano", crew: "I Sarti", handle: "@sarti.milano", place: "milano", earns: 1, landmark: "Duomo", colour: "#d9b45a", light: "#3d3420", dark: "#a8821a", styles: ["Torre della Borsa", "Atelier", "Bosco Verticale"] },
  { id: 1, city: "Roma", crew: "I Gladiatori", handle: "@gladiatori.roma", place: "roma", earns: 0, landmark: "Colosseo", colour: "#e0874f", light: "#3d2a1f", dark: "#c2541f", styles: ["Tempietto", "Villa Romana", "Fontana"] },
  { id: 2, city: "Napoli", crew: "I Lazzari", handle: "@lazzari.napoli", place: "napoli", earns: 3, landmark: "Vesuvio", colour: "#e0648f", light: "#3b2230", dark: "#c23a6b", styles: ["Pizzeria", "Palazzo dei Quartieri", "Teatro"] },
  { id: 3, city: "Venezia", crew: "Le Maschere", handle: "@maschere.venezia", place: "venezia", earns: 2, landmark: "Campanile", colour: "#5b8def", light: "#1f2c45", dark: "#2f62c4", styles: ["Palazzo sul Canale", "Fornace di Murano", "Bottega delle Maschere"] },
  { id: 4, city: "Palermo", crew: "I Normanni", handle: "@normanni.palermo", place: "palermo", earns: 4, landmark: "Cattedrale", colour: "#5fc48a", light: "#1d3a2a", dark: "#2f8a55", styles: ["Palazzo Barocco", "Torre Normanna", "Villa con Palme"] },
];

/** The token city `d` earns. */
export function cityToken(d: District): TokenId {
  return d.earns;
}

/** A reward token: one of Montra's top tokens, each earned by one city. */
export type TokenId = 0 | 1 | 2 | 3 | 4;

export interface RewardToken {
  id: TokenId;
  token: string;
  symbol: string;
  colour: string;
  /** Darker ink for the light theme. */
  colourLight: string;
  tokenAddress: `0x${string}`;
  /** What its Montra pool is paired with (MONTRA trades against KNTQ). */
  pair: "HYPE" | "KNTQ";
}

// Order matches the vault's token list. Picked by Juan (Nov 2026): Montra's top five by market
// cap, leaving out EACCVIDIA (paired with a leveraged NVIDIA token).
export const TOKENS: RewardToken[] = [
  { id: 0, token: "MONTRA", symbol: "MONTRA", colour: "#e9b64a", colourLight: "#9a6f12", tokenAddress: "0x063f7cc5339f92a5fd7baf3d22233044fda1f327", pair: "KNTQ" },
  { id: 1, token: "LiquidV", symbol: "LiquidV", colour: "#62c6f2", colourLight: "#1f7fa8", tokenAddress: "0xd12609ddb1cd18280c7c14fb2cb5091cfea37f2d", pair: "HYPE" },
  { id: 2, token: "EACCAT", symbol: "EACCAT", colour: "#b59ce8", colourLight: "#7a52b8", tokenAddress: "0x32193afd14c53f12c45a4c04eca9f7ba98e3ec71", pair: "HYPE" },
  { id: 3, token: "CHAMELEON", symbol: "CHAMELEON", colour: "#4fd1c5", colourLight: "#1d8a80", tokenAddress: "0xd662d66ec991a3eae4ecbda34327264c53d4cf38", pair: "HYPE" },
  { id: 4, token: "NUM", symbol: "NUM", colour: "#ff8a7a", colourLight: "#c2473a", tokenAddress: "0xe9c952cd198ff412113a465d34ff2c233f6f4ca1", pair: "HYPE" },
];

export const MAX_BUILDINGS = 3000;
export const EARLY_BIRD_UNITS = 300;
export const EARLY_BIRD_USD = 40;
export const TIERS = [
  { upTo: 800, usd: 52 },
  { upTo: 1500, usd: 68 },
  { upTo: 2300, usd: 88 },
  { upTo: 3000, usd: 120 },
];

/** The real city, filled in after the launch. While `vault` is null the site shows the preview
 *  with sample data (or, with PRELAUNCH, an empty closed city). */
export const LIVE: { vault: `0x${string}` | null; capitale: `0x${string}` | null } = {
  vault: null,
  capitale: null,
};
/** A rehearsal city on Elysium (test token), opened with /?city=rehearsal. None yet. */
export const REHEARSAL: { vault: `0x${string}`; capitale: `0x${string}` } | null = null;
export const CAPITALE_ADDRESS = LIVE.capitale;
/** Launch day only: show an empty, closed city instead of the sample-data preview. */
export const PRELAUNCH = false;
/** The city tax is paid in the asset $CAPITALE is paired with on Montra: native HYPE. */
export const INCOME = { symbol: "HYPE", tokenAddress: null as `0x${string}` | null };
export const GAS_SYMBOL = "HYPE";
export const MONTRA_URL = "https://montramarkets.xyz";

export function usdForBuilding(id: number, earlyBird: boolean): number {
  if (earlyBird && id <= EARLY_BIRD_UNITS) return EARLY_BIRD_USD;
  return (TIERS.find((t) => id <= t.upTo) ?? TIERS[TIERS.length - 1]).usd;
}

/** L1 $0, L2 $5, L3 $20, L4 $50, L5 $100, then +1 per extra $50 (same rule as the vault). */
export function levelForUsd(usd: number): number {
  if (usd < 5) return 1;
  if (usd < 20) return 2;
  if (usd < 50) return 3;
  if (usd < 100) return 4;
  return 5 + Math.floor((usd - 100) / 50);
}

export function usdForNextLevel(level: number): number {
  return [0, 5, 20, 50, 100][level] ?? 100 + (level - 4) * 50;
}
