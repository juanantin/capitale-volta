// Engraved, banknote-style art drawn with PixiJS Graphics, in Volta's palette: deep forest
// greens with mint linework, hatching on shaded faces and glowing windows. Each city keeps
// its own ink colour on roofs and tops. Height floors are procedural so levels have no cap.

import { Graphics } from "pixi.js";
import { DISTRICTS } from "./config";
import type { Theme } from "./theme";

/** Volta palette by role. Dark: mint lines on forest. Light: forest ink on mint paper. */
const PALETTES = {
  dark: {
    void: 0x041510, // sea / page
    plate: 0x08201a, // shaded faces
    forest: 0x0b2a21, // land
    panel: 0x0f3529, // lit faces
    panel2: 0x123a2e, // lit stone (Duomo, belfry)
    emerald: 0x245746,
    mint: 0x80e3ba, // linework
    ivory: 0xe7f5ed, // highlights
    muted: 0x94b7a7,
    cliff: 0x020c09,
    shadow: 0x000000,
    shadowAlpha: 0.35,
    lineAlpha: 0.06, // sea and land engraving
  },
  light: {
    void: 0xe3ede8,
    plate: 0xd5e4dc,
    forest: 0xf4f9f6,
    panel: 0xfbfdfc,
    panel2: 0xeef5f1,
    emerald: 0x8db3a1,
    mint: 0x08704b,
    ivory: 0x0b2a21,
    muted: 0x476658,
    cliff: 0xbfd3c8,
    shadow: 0x0b2a21,
    shadowAlpha: 0.12,
    lineAlpha: 0.1,
  },
};

/** Current palette; switched by applyArtTheme (textures must be re-baked afterwards). */
export const V = { ...PALETTES.light };
let artTheme: Theme = "light";

export function applyArtTheme(t: Theme) {
  artTheme = t;
  Object.assign(V, PALETTES[t]);
}

/** A city's ink for the current theme (light mode uses its darker ink). */
export function cityInk(d: number): number {
  const D = DISTRICTS[d];
  return hex(artTheme === "light" ? D.dark : D.colour);
}

const OUTLINE = {
  width: 1.2,
  get color() {
    return V.mint;
  },
  join: "round" as const,
};
const FINE = {
  width: 0.6,
  get color() {
    return V.mint;
  },
  alpha: 0.45,
};

const hex = (c: string) => parseInt(c.slice(1), 16);

export function mix(a: number, b: number, t: number): number {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
  );
}

export interface Palette {
  lit: number;
  shade: number;
  top: number;
  roof: number;
  roofShade: number;
  window: number;
  accent: number;
}

/** Walls are engraved forest green for every city; the city's ink colours the roof and top. */
export function districtPalette(d: number): Palette {
  const ink = cityInk(d);
  return {
    lit: V.panel,
    shade: V.plate,
    top: mix(ink, V.forest, 0.55),
    roof: mix(ink, V.forest, 0.35),
    roofShade: mix(ink, V.plate, 0.6),
    window: V.mint,
    accent: ink,
  };
}

export function mayorPalette(): Palette {
  return {
    lit: mix(V.panel, V.mint, 0.08),
    shade: mix(V.plate, V.mint, 0.04),
    top: mix(V.forest, V.mint, 0.18),
    roof: mix(V.mint, V.forest, 0.25),
    roofShade: mix(V.mint, V.plate, 0.55),
    window: V.ivory,
    accent: V.mint,
  };
}

const FLOOR_H = 5;
const GROUND_H = 9;

/** Vertical engraving lines across a parallelogram face (bottom edge p0→p1, height h). */
function hatchFace(g: Graphics, x0: number, y0: number, x1: number, y1: number, h: number, step: number) {
  const n = Math.floor(Math.abs(x1 - x0) / step);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    g.moveTo(x, y).lineTo(x, y - h);
  }
  if (n > 1) g.stroke(FINE);
}

/** Isometric box: footprint half-width `a`, ground at y = -base, `h` tall. */
function box(g: Graphics, a: number, base: number, h: number, p: Palette, windows: boolean) {
  const b = -base;
  g.poly([-a, b, 0, b + a / 2, 0, b + a / 2 - h, -a, b - h]).fill(p.lit).stroke(OUTLINE);
  g.poly([0, b + a / 2, a, b, a, b - h, 0, b + a / 2 - h]).fill(p.shade).stroke(OUTLINE);
  hatchFace(g, 0, b + a / 2, a, b, h, 1.6);
  if (!windows) return;
  const floors = Math.max(1, Math.floor((h - GROUND_H) / FLOOR_H) + 1);
  for (let k = 0; k < floors; k++) {
    const v0 = k === 0 ? 2.5 : GROUND_H + (k - 1) * FLOOR_H + 1.3;
    const v1 = v0 + (k === 0 ? 4 : 2.6);
    for (const [u0, u1] of [
      [0.22, 0.42],
      [0.58, 0.78],
    ]) {
      g.poly([
        -a + u0 * a, b + (u0 * a) / 2 - v0,
        -a + u1 * a, b + (u1 * a) / 2 - v0,
        -a + u1 * a, b + (u1 * a) / 2 - v1,
        -a + u0 * a, b + (u0 * a) / 2 - v1,
      ]).fill({ color: p.window, alpha: 0.85 });
      g.poly([
        u0 * a, b + a / 2 - (u0 * a) / 2 - v0,
        u1 * a, b + a / 2 - (u1 * a) / 2 - v0,
        u1 * a, b + a / 2 - (u1 * a) / 2 - v1,
        u0 * a, b + a / 2 - (u0 * a) / 2 - v1,
      ]).fill({ color: p.window, alpha: 0.35 });
    }
  }
}

function topDiamond(g: Graphics, a: number, y: number, color: number) {
  g.poly([-a, y, 0, y + a / 2, a, y, 0, y - a / 2]).fill(color).stroke(OUTLINE);
}

function shadow(g: Graphics, a: number) {
  g.ellipse(3, 2, a + 4, a / 2 + 3).fill({ color: V.shadow, alpha: V.shadowAlpha });
}

/** Ground floor plus one floor per level above 1 (no cap). */
export function floorsForLevel(level: number) {
  return level;
}

export function heightForLevel(level: number) {
  return GROUND_H + (level - 1) * FLOOR_H;
}

export function drawBuilding(g: Graphics, district: number, style: number, level: number) {
  const p = districtPalette(district);
  const a = 10;
  const h = heightForLevel(level);
  shadow(g, a);
  box(g, a, 0, h, p, true);
  const y = -h;
  if (style === 0) {
    // tower: flat roof, parapet, antenna with a mint beacon
    topDiamond(g, a, y, p.top);
    g.poly([-a * 0.62, y - 1, 0, y - 1 + a * 0.31, a * 0.62, y - 1, 0, y - 1 - a * 0.31]).stroke({ width: 0.8, color: p.accent });
    g.moveTo(2, y - 2).lineTo(2, y - 9).stroke({ width: 1, color: V.mint });
    g.circle(2, y - 10, 1.5).fill(V.ivory);
  } else if (style === 1) {
    // pitched roof in the city's ink
    const apex = y - 10;
    g.poly([-a - 1, y, 0, y + a / 2 + 1, 0, apex]).fill(p.roof).stroke(OUTLINE);
    g.poly([0, y + a / 2 + 1, a + 1, y, 0, apex]).fill(p.roofShade).stroke(OUTLINE);
    // engraved strokes from the eave up to the ridge
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      g.moveTo(-a - 1 + (a + 1) * t, y + (a / 2 + 1) * t).lineTo(0, apex);
    }
    g.stroke(FINE);
  } else {
    // dome, engraved with meridians
    topDiamond(g, a, y, p.top);
    const r = a * 0.72;
    g.ellipse(0, y - 1, r, r).fill(p.roof).stroke(OUTLINE);
    g.ellipse(0, y - 1, r * 0.45, r).stroke(FINE);
    g.moveTo(0, y - 1 - r).lineTo(0, y - 1 + r).stroke(FINE);
    g.moveTo(0, y - r - 1).lineTo(0, y - r - 5).stroke({ width: 1, color: V.mint });
  }
}

export function drawMayor(g: Graphics) {
  const p = mayorPalette();
  const a = 24;
  shadow(g, a);
  box(g, a + 4, 0, 5, { ...p, lit: V.forest, shade: V.plate }, false);
  topDiamond(g, a + 4, -5, V.panel);
  box(g, a, 5, 30, p, true);
  // ivory columns on the lit face
  for (let i = 0; i < 4; i++) {
    const u = 0.15 + i * 0.22;
    const x = -a + u * a;
    const yb = -5 + (u * a) / 2;
    g.rect(x - 1.2, yb - 26, 2.4, 26).fill(V.forest).stroke({ width: 0.8, color: V.ivory });
  }
  topDiamond(g, a, -35, p.top);
  g.ellipse(0, -38, 13, 13).fill(p.roof).stroke(OUTLINE);
  g.ellipse(0, -38, 6, 13).stroke(FINE);
  g.moveTo(0, -51).lineTo(0, -66).stroke({ width: 1.4, color: V.mint });
  // tricolore pennant, engraved
  g.rect(0, -66, 5, 6).fill(0x2fae7a);
  g.rect(5, -66, 5, 6).fill(V.ivory);
  g.rect(10, -66, 5, 6).fill(0xd5703c);
  g.rect(0, -66, 15, 6).stroke({ width: 0.8, color: V.mint });
}

export function drawDuomo(g: Graphics) {
  const p: Palette = { ...districtPalette(0), lit: V.panel2, shade: V.plate, top: V.panel };
  const a = 34;
  shadow(g, a);
  box(g, a, 0, 16, p, false);
  topDiamond(g, a, -16, p.top);
  const spire = (x: number, y: number, hgt: number) => {
    g.poly([x - 2.2, y, x + 2.2, y, x, y - hgt]).fill(V.forest).stroke({ width: 0.9, color: V.mint });
    g.circle(x, y - hgt, 1.2).fill(p.accent);
  };
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    spire(-a + u * a, -16 + (u * a) / 2, 10 + (i % 2) * 5);
    spire(u * a, -16 + a / 2 - (u * a) / 2, 10 + ((i + 1) % 2) * 5);
  }
  g.poly([-4, -16, 4, -16, 0, -58]).fill(V.forest).stroke(OUTLINE);
  g.circle(0, -60, 3).fill(p.accent).stroke({ width: 0.8, color: V.ivory });
  // rose window as a small guilloche
  rosette(g, -a / 2, -8 + a / 4 - 4, 4.2, 9, p.accent, 0.8);
}

export function drawColosseum(g: Graphics) {
  const ink = cityInk(1);
  const rx = 40;
  const ry = 21;
  const h = 26;
  g.ellipse(4, 3, rx + 4, ry + 3).fill({ color: V.shadow, alpha: V.shadowAlpha });
  g.ellipse(0, 0, rx, ry).fill(V.panel);
  g.rect(-rx, -h, rx * 2, h).fill(V.panel);
  g.moveTo(-rx, -h).lineTo(-rx, 0).stroke(OUTLINE);
  g.moveTo(rx, -h).lineTo(rx, 0).stroke(OUTLINE);
  g.arc(0, 0, rx, 0, Math.PI).stroke(OUTLINE);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5) / 9;
      const x = -rx + t * rx * 2;
      const dy = Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) * ry;
      const yb = dy - row * 8.5 - 2;
      g.roundRect(x - 2.4, yb - 6, 4.8, 6, 2).fill(V.void).stroke({ width: 0.7, color: V.mint, alpha: 0.7 });
    }
  }
  g.ellipse(0, -h, rx, ry).fill(mix(ink, V.forest, 0.5)).stroke(OUTLINE);
  g.ellipse(0, -h + 2, rx - 9, ry - 6).fill(V.plate).stroke({ width: 0.8, color: V.mint });
  g.ellipse(0, -h + 4, rx - 18, ry - 12).fill(mix(ink, V.plate, 0.7));
  // tiers engraved as concentric lines
  g.ellipse(0, -h + 1, rx - 4.5, ry - 3).stroke(FINE);
}

export function drawVesuvius(g: Graphics) {
  const ink = cityInk(2);
  g.ellipse(6, 4, 82, 26).fill({ color: V.shadow, alpha: V.shadowAlpha });
  g.poly([-78, 0, -18, -78, 18, -78, 78, 0, 0, 22]).fill(V.panel);
  g.poly([0, 22, 78, 0, 18, -78, 4, -78]).fill(V.plate);
  // contour engraving on the slopes
  for (let k = 1; k < 8; k++) {
    const t = k / 8;
    g.moveTo(-78 + 60 * t, -78 * t).quadraticCurveTo(0, -78 * t + 26 * (1 - t), 78 - 60 * t, -78 * t);
  }
  g.stroke(FINE);
  g.poly([-78, 0, -18, -78, 18, -78, 78, 0, 0, 22]).stroke(OUTLINE);
  g.ellipse(0, -78, 18, 6).fill(V.void).stroke(OUTLINE);
  g.ellipse(0, -77, 10, 3).fill(ink);
  // pizzeria at the foot
  const p = districtPalette(2);
  const px = 46;
  const py = 10;
  g.ellipse(px + 2, py + 2, 12, 5).fill({ color: V.shadow, alpha: V.shadowAlpha * 0.85 });
  g.poly([px - 9, py, px, py + 4.5, px, py - 9.5, px - 9, py - 14]).fill(V.panel).stroke(OUTLINE);
  g.poly([px, py + 4.5, px + 9, py, px + 9, py - 14, px, py - 9.5]).fill(V.plate).stroke(OUTLINE);
  g.poly([px - 10, py - 14, px, py - 9, px, py - 22]).fill(p.roof).stroke(OUTLINE);
  g.poly([px, py - 9, px + 10, py - 14, px, py - 22]).fill(p.roofShade).stroke(OUTLINE);
  for (let i = 0; i < 4; i++) {
    g.poly([px - 9 + i * 2.25, py - 6 + i * 1.1, px - 6.75 + i * 2.25, py - 4.9 + i * 1.1, px - 6.75 + i * 2.25, py - 2.4 + i * 1.1, px - 9 + i * 2.25, py - 3.5 + i * 1.1]).fill(
      i % 2 ? V.ivory : ink,
    );
  }
  g.rect(px + 4, py - 24, 3, 7).fill(V.forest).stroke({ width: 0.8, color: V.mint });
}

export function drawCampanile(g: Graphics) {
  const ink = cityInk(3);
  const p: Palette = { ...districtPalette(3), lit: V.panel, shade: V.plate, top: V.forest };
  const a = 10;
  shadow(g, a);
  box(g, a, 0, 64, p, false);
  for (const v of [16, 32, 48]) {
    g.poly([-a, -v, 0, a / 2 - v, 0, a / 2 - v - 1.4, -a, -v - 1.4]).fill({ color: V.mint, alpha: 0.6 });
    g.poly([0, a / 2 - v, a, -v, a, -v - 1.4, 0, a / 2 - v - 1.4]).fill({ color: V.mint, alpha: 0.3 });
  }
  box(g, a, 64, 12, { ...p, lit: V.panel2 }, false);
  g.poly([-a + 3, -66 + 1.5, -3, -66 + 3.5, -3, -74 + 3.5, -a + 3, -74 + 1.5]).fill(V.void).stroke({ width: 0.7, color: V.mint });
  topDiamond(g, a, -76, V.forest);
  g.poly([-a, -76, 0, -76 + a / 2, 0, -100]).fill(mix(ink, V.forest, 0.35)).stroke(OUTLINE);
  g.poly([0, -76 + a / 2, a, -76, 0, -100]).fill(mix(ink, V.plate, 0.6)).stroke(OUTLINE);
  g.circle(0, -102, 2.2).fill(V.ivory);
}

export function drawTree(g: Graphics, kind: number) {
  g.ellipse(2, 1, 6, 3).fill({ color: V.shadow, alpha: V.shadowAlpha * 0.85 });
  if (kind === 0) {
    // cypress, like the frieze: tall flame with engraved strokes
    g.ellipse(0, -10, 3.4, 10).fill(V.forest).stroke({ width: 0.9, color: V.mint });
    g.moveTo(-1, -2).lineTo(-0.5, -17).moveTo(1, -3).lineTo(1, -15).stroke(FINE);
  } else {
    g.moveTo(0, 0).lineTo(0, -5).stroke({ width: 1, color: V.mint, alpha: 0.7 });
    g.circle(0, -8, 5.5).fill(kind === 1 ? V.forest : V.panel).stroke({ width: 0.9, color: V.mint });
    g.arc(0, -8, 3.2, Math.PI * 0.9, Math.PI * 1.7).stroke(FINE);
  }
}

export function drawBoat(g: Graphics, sail: number) {
  g.moveTo(-12, 4).lineTo(12, 4).stroke({ width: 0.6, color: V.mint, alpha: 0.4 });
  g.poly([-10, 0, 10, 0, 7, 4, -7, 4]).fill(V.forest).stroke({ width: 0.9, color: V.mint });
  g.moveTo(0, 0).lineTo(0, -16).stroke({ width: 0.9, color: V.mint });
  g.poly([0.6, -15, 0.6, -2, 9, -2]).fill(mix(sail, V.forest, 0.35)).stroke({ width: 0.9, color: V.mint });
}

export function drawGondola(g: Graphics) {
  g.moveTo(-14, 3).lineTo(14, 3).stroke({ width: 0.6, color: V.mint, alpha: 0.4 });
  g.moveTo(-13, -4).quadraticCurveTo(0, 4, 13, -5).quadraticCurveTo(0, 1, -13, -4).fill(V.void).stroke({ width: 0.9, color: V.mint });
  g.moveTo(6, -2).lineTo(9, -13).stroke({ width: 1, color: V.mint });
  g.circle(6, -9, 1.6).fill(V.ivory);
}

/** Engraved cloud: a few overlapping arcs drawn in thin mint lines over a faint wash. */
export function drawCloud(g: Graphics) {
  for (const [x, y, r] of [
    [0, 0, 22],
    [24, 4, 17],
    [-22, 6, 15],
    [10, -10, 16],
  ]) {
    g.circle(x, y, r).fill({ color: V.void, alpha: 0.25 });
  }
  for (const [x, y, r] of [
    [0, 0, 22],
    [24, 4, 17],
    [-22, 6, 15],
    [10, -10, 16],
  ]) {
    g.arc(x, y, r, Math.PI * 1.05, Math.PI * 1.95).stroke({ width: 0.8, color: V.mint, alpha: 0.35 });
  }
}

export function drawEmptyPlot(g: Graphics, color: number) {
  const a = 10;
  g.poly([-a, 0, 0, a / 2, a, 0, 0, -a / 2]).fill({ color, alpha: 0.12 }).stroke({ width: 1, color });
  g.moveTo(-3, 0).lineTo(3, 0).stroke({ width: 1, color: V.ivory });
  g.moveTo(0, -1.8).lineTo(0, 1.8).stroke({ width: 1, color: V.ivory });
}

/** Countryside scenery: a small engraved house (not an NFT). */
export function drawCottage(g: Graphics, variant: number) {
  const p: Palette = {
    lit: V.forest,
    shade: V.plate,
    top: V.forest,
    roof: [mix(V.forest, V.mint, 0.2), mix(V.forest, V.mint, 0.3), mix(V.forest, V.mint, 0.14)][variant % 3],
    roofShade: V.plate,
    window: V.mint,
    accent: V.mint,
  };
  const a = 7;
  const h = variant === 2 ? 12 : 7;
  shadow(g, a);
  box(g, a, 0, h, p, false);
  g.poly([-2.5, 2.2, -1, 2.9, -1, 0.2 - h / 2, -2.5, -0.5 - h / 2]).fill({ color: V.mint, alpha: 0.7 });
  const apex = -h - 7;
  g.poly([-a - 1, -h, 0, -h + a / 2 + 1, 0, apex]).fill(p.roof).stroke({ width: 0.9, color: V.mint, alpha: 0.8 });
  g.poly([0, -h + a / 2 + 1, a + 1, -h, 0, apex]).fill(p.roofShade).stroke({ width: 0.9, color: V.mint, alpha: 0.8 });
}

/**
 * Guilloche rosette (a hypotrochoid-style ring of loops), the motif of Volta's mark.
 * `petals` loops around a circle of radius `r`; drawn flat (callers squash for the map tilt).
 */
export function rosette(g: Graphics, cx: number, cy: number, r: number, petals: number, color: number, width = 0.7, alpha = 1) {
  const steps = petals * 40;
  const inner = r * 0.55;
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * Math.PI * 2;
    const rr = inner + (r - inner) * Math.abs(Math.sin((petals * t) / 2));
    const x = cx + Math.cos(t) * rr;
    const y = cy + Math.sin(t) * rr;
    if (k === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke({ width, color, alpha });
}
