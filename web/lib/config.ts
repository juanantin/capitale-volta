// Static facts about Capitale on Elysium: four cities, three reward tokens (VOLTA, SENT, VOID).
// $CAPITALE launches on Volta paired with $VOLTA; its creator fee (in VOLTA) is the city tax.
// Contract addresses are filled in after the testnet deploy.

/** A city on the map. Cities set a building's plot and its team in the weekly street race;
 *  every city earns the same reward tokens. */
export type DistrictId = 0 | 1 | 2 | 3;

export interface District {
  id: DistrictId;
  city: string;
  place: "milano" | "roma" | "napoli" | "venezia";
  landmark: string;
  colour: string; // main colour
  light: string;
  dark: string;
  styles: [string, string, string];
}

export const DISTRICTS: District[] = [
  { id: 0, city: "Milano", place: "milano", landmark: "Duomo", colour: "#d9b45a", light: "#3d3420", dark: "#a8821a", styles: ["Torre della Borsa", "Atelier", "Bosco Verticale"] },
  { id: 1, city: "Roma", place: "roma", landmark: "Colosseo", colour: "#e0874f", light: "#3d2a1f", dark: "#c2541f", styles: ["Tempietto", "Villa Romana", "Fontana"] },
  { id: 2, city: "Napoli", place: "napoli", landmark: "Vesuvio", colour: "#e0648f", light: "#3b2230", dark: "#c23a6b", styles: ["Pizzeria", "Palazzo dei Quartieri", "Teatro"] },
  { id: 3, city: "Venezia", place: "venezia", landmark: "Campanile", colour: "#5b8def", light: "#1f2c45", dark: "#2f62c4", styles: ["Palazzo sul Canale", "Fornace di Murano", "Bottega delle Maschere"] },
];

/** A reward token. The weekly vote picks which one the vault buys for every building. */
export type TokenId = 0 | 1 | 2;

export interface RewardToken {
  id: TokenId;
  token: string;
  symbol: string;
  colour: string;
  tokenAddress: `0x${string}`;
}

export const TOKENS: RewardToken[] = [
  { id: 0, token: "VOLTA", symbol: "VOLTA", colour: "#80e3ba", tokenAddress: "0x0f79931689Af199e7CF868ed1107bBA2C83c68f7" },
  { id: 1, token: "SENT", symbol: "SENT", colour: "#e0a35f", tokenAddress: "0xA713a15b85Cab304F9e2fbc649440B5e3AB8a8D4" },
  { id: 2, token: "VOID", symbol: "VOID", colour: "#b59ce8", tokenAddress: "0xD31B21Cb80E431AC996269deC31A40fCf048B77f" },
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

export const CAPITALE_ADDRESS: string | null = null; // set at launch
/** The city tax is paid in the asset $CAPITALE is paired with on Volta. */
export const INCOME = { symbol: "VOLTA", tokenAddress: "0x0f79931689Af199e7CF868ed1107bBA2C83c68f7" as `0x${string}` };
export const GAS_SYMBOL = "HYPE";
export const VOLTA_URL = "https://volta.family";

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
