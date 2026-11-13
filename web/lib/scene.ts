// The animated city map (PixiJS). Owns everything drawn on the canvas; React only passes it
// the building list and listens for taps and camera moves (for the HTML banners on top).

import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import {
  drawBoat,
  drawBuilding,
  drawCloud,
  drawColosseum,
  drawDuomo,
  drawEmptyPlot,
  drawGondola,
  drawMayor,
  drawTree,
  drawVesuvius,
  drawCampanile,
  drawCottage,
  floorsForLevel,
  districtPalette,
  rosette,
  V,
  cityInk,
  mix,
} from "./art";
import { DISTRICTS, levelForUsd } from "./config";
import { BUILDING_SCALE, COMPASS, DISTRICT_PLACES, GRATICULE, LANDMARK_SCALE, NEIGHBOURS, ORNAMENTS, PLACES, PLOT_SPACING, Pt, RINGS, TILT, WORLD, onAnyLand, onLand, plotPosition } from "./plots";

/** Textures are baked at this resolution so they stay crisp when zoomed in. */
const RES = 3;
const K = 1 / RES;
import { ui, type Building } from "./store";

// Volta palette: deep forest sea, forest land, mint linework.
// Colours are read from the theme palette (V) when things are drawn, not at load.
const inks = () => [0, 1, 2, 3].map(cityInk).concat([V.mint, V.ivory]);

interface Baked {
  texture: Texture;
  ax: number;
  ay: number;
}

interface Tween {
  t: number;
  dur: number;
  step: (p: number) => void;
  done?: () => void;
}

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  grow: number;
  alpha: number;
}

const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

type SpriteKeys = Record<string, string>;

export interface SceneCallbacks {
  onSelect: (id: number | null) => void;
  onCamera: () => void;
}

export class CityScene {
  app = new Application();
  world = new Container();
  private objects = new Container();
  private ground = new Container();
  private fx = new Container();
  private clouds = new Container();
  private baked = new Map<string, Baked>();
  private sprites = new Map<number, Sprite>();
  private spriteCity = new Map<number, number>();
  private levels = new Map<number, number>();
  private trees: { s: Sprite; p: Pt }[] = [];
  private treeGrid = new Map<string, number[]>();
  private tweens: Tween[] = [];
  private particles: Particle[] = [];
  private pool: Sprite[] = [];
  private dot!: Texture;
  private star!: Texture;
  private boats: { s: Sprite; c: Pt; r: number; a: number; speed: number; sq: number }[] = [];
  private waves: { s: Sprite; t: number; period: number }[] = [];
  private cloudList: { s: Container; speed: number }[] = [];
  private emitters: { p: Pt; rate: number; acc: number; big: boolean }[] = [];
  private markers: Sprite[] = [];
  private ring = new Graphics();
  private inviters: number[] = [];
  private fireworkAcc = 0;
  private sprites404: SpriteKeys = {};
  private destroyed = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; t: number; moved: boolean } | null = null;
  private pinch: { d: number; scale: number; cx: number; cy: number } | null = null;
  private camTween: Tween | null = null;
  private cb: SceneCallbacks;
  private el!: HTMLElement;
  private buildingsById = new Map<number, Building>();
  private reducedMotion = false;

  constructor(cb: SceneCallbacks) {
    this.cb = cb;
  }

  async init(el: HTMLElement) {
    this.el = el;
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    await this.app.init({
      resizeTo: el,
      background: V.void,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: "webgl",
    });
    if (this.destroyed) return;
    el.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = "none";

    this.dot = this.bakeTexture((g) => g.circle(0, 0, 8).fill(0xffffff));
    this.star = this.bakeTexture((g) =>
      g.poly([0, -6, 1.6, -1.6, 6, 0, 1.6, 1.6, 0, 6, -1.6, 1.6, -6, 0, -1.6, -1.6]).fill(0xffffff),
    );
    await this.loadRealSprites();

    this.app.stage.addChild(this.world);
    const sea = new Container();
    this.world.addChild(sea, this.drawIsland(), this.ground, this.objects, this.fx, this.clouds);
    this.objects.sortableChildren = true;
    this.ring.ellipse(0, 0, 80, 40).stroke({ width: 4, color: V.mint }).ellipse(0, 0, 70, 35).stroke({ width: 1.5, color: V.ivory, alpha: 0.7 }).ellipse(0, 0, 66, 33).fill({ color: V.mint, alpha: 0.12 });
    this.ring.visible = false;
    this.ground.addChild(this.ring);
    this.makeWaves(sea);
    this.makeBoats(sea);
    this.makeLandmarks();
    this.makeTrees();
    this.makeClouds();
    this.fit();
    this.bindInput();
    this.app.ticker.add((t) => {
      try {
        this.update(t.deltaMS / 1000);
      } catch (e) {
        // Never let one bad frame freeze the map: drop running animations and carry on.
        this.tweens = [];
        console.error(e);
      }
    });
  }

  destroy() {
    this.destroyed = true;
    try {
      this.app.destroy(true, { children: true, texture: true });
    } catch {
      /* not initialised yet */
    }
  }

  // ─────────── real sprites (optional) ───────────

  private async loadRealSprites() {
    try {
      const res = await fetch("/sprites/manifest.json", { cache: "no-store" });
      if (!res.ok) return;
      const m = (await res.json()) as SpriteKeys;
      const entries = Object.entries(m);
      await Promise.all(entries.map(([, url]) => Assets.load(url)));
      this.sprites404 = m;
    } catch {
      this.sprites404 = {};
    }
  }

  private realTexture(key: string): Texture | null {
    const url = this.sprites404[key];
    return url ? (Assets.get(url) as Texture) : null;
  }

  // ─────────── texture baking ───────────

  private bakeTexture(draw: (g: Graphics) => void): Texture {
    const g = new Graphics();
    draw(g);
    const t = this.app.renderer.generateTexture({ target: g, resolution: RES, antialias: true });
    g.destroy();
    return t;
  }

  private bake(key: string, draw: (c: Container) => void): Baked {
    const hit = this.baked.get(key);
    if (hit) return hit;
    const c = new Container();
    draw(c);
    const b = c.getLocalBounds();
    const texture = this.app.renderer.generateTexture({ target: c, resolution: RES, antialias: true });
    c.destroy({ children: true });
    const baked = { texture, ax: -b.x / b.width, ay: -b.y / b.height };
    this.baked.set(key, baked);
    return baked;
  }

  private buildingTexture(d: number, style: number, level: number): Baked {
    const real = this.realTexture(`style_${d}_${style}`);
    if (!real) {
      return this.bake(`b${d}_${style}_${level}`, (c) => {
        const g = new Graphics();
        drawBuilding(g, d, style, level);
        c.addChild(g);
      });
    }
    // Real sprite on top, procedural floors underneath: one extra floor per level above 1.
    return this.bake(`r${d}_${style}_${level}`, (c) => {
      const extra = floorsForLevel(level) - 1;
      const g = new Graphics();
      const p = districtPalette(d);
      const a = 12;
      g.ellipse(3, 2, a + 4, a / 2 + 3).fill({ color: V.shadow, alpha: V.shadowAlpha });
      for (let k = 0; k < extra; k++) {
        const b = -k * 5;
        g.poly([-a, b, 0, b + a / 2, 0, b + a / 2 - 5, -a, b - 5]).fill(p.lit).stroke({ width: 1.2, color: V.mint });
        g.poly([0, b + a / 2, a, b, a, b - 5, 0, b + a / 2 - 5]).fill(p.shade).stroke({ width: 1.2, color: V.mint });
      }
      c.addChild(g);
      const s = new Sprite(real);
      s.anchor.set(0.5, 0.92);
      s.scale.set(30 / real.width);
      s.y = -Math.max(0, extra) * 5;
      c.addChild(s);
    });
  }

  private base = new WeakMap<Sprite, number>();

  private place(baked: Baked, p: Pt, mult = 1): Sprite {
    const s = new Sprite(baked.texture);
    s.anchor.set(baked.ax, baked.ay);
    s.scale.set(K * mult);
    this.base.set(s, K * mult);
    s.position.set(p[0], p[1]);
    s.zIndex = p[1];
    this.objects.addChild(s);
    return s;
  }

  // ─────────── static world ───────────

  private drawIsland(): Container {
    const c = new Container();
    // Engraved sea: fine horizontal lines, like the sky in Volta's frieze.
    const sea = new Graphics();
    for (let y = -900; y < WORLD.height + 900; y += 9) sea.moveTo(-1200, y).lineTo(WORLD.width + 1200, y);
    sea.stroke({ width: 0.8, color: V.mint, alpha: V.lineAlpha });
    const decor = this.drawSeaDecor();
    // Coast drawn as layered contour lines (a thin mint line on each band's edge).
    const contours = new Graphics();
    for (const [w, alpha] of [
      [86, 0.12],
      [60, 0.2],
      [36, 0.32],
    ] as const) {
      for (const ring of RINGS) contours.poly(ring.flat()).stroke({ width: w, color: V.mint, alpha, join: "round" });
      for (const ring of RINGS) contours.poly(ring.flat()).stroke({ width: w - 3, color: V.void, join: "round" });
    }
    const cliff = new Graphics();
    const land = new Graphics();
    const landMask = new Graphics();
    for (const ring of RINGS) {
      const flat = ring.flat();
      cliff.poly(ring.flatMap(([x, y]) => [x, y + 14])).fill(V.cliff).stroke({ width: 6, color: V.cliff, join: "round" });
      land.poly(flat).fill(V.forest).stroke({ width: 2.2, color: V.mint, join: "round" });
      landMask.poly(flat).fill(0xffffff);
    }
    // Diagonal hatching across the land, clipped to the coastline.
    const hatch = new Graphics();
    for (let x = -WORLD.height; x < WORLD.width; x += 14) hatch.moveTo(x, 0).lineTo(x + WORLD.height, WORLD.height);
    hatch.stroke({ width: 0.9, color: V.mint, alpha: V.lineAlpha * 1.15 });
    hatch.mask = landMask;
    c.addChild(sea, decor, contours, cliff, land, landMask, hatch, this.drawOrnaments());
    // A guilloche rosette in each city's ink around its landmark, and a mint one for the Mayor.
    const rings: [Pt, number][] = [
      ...DISTRICT_PLACES.map((k, i) => [PLACES[k], cityInk(i)] as [Pt, number]),
      [PLACES.mayor, V.mint],
    ];
    for (const [[x, y], color] of rings) {
      const g = new Graphics();
      g.circle(0, 0, 150).fill({ color, alpha: 0.06 });
      rosette(g, 0, 0, 150, 24, color, 1.4, 0.55);
      rosette(g, 0, 0, 118, 18, color, 1, 0.35);
      g.circle(0, 0, 150).stroke({ width: 1.6, color, alpha: 0.8 });
      g.circle(0, 0, 156).stroke({ width: 0.8, color, alpha: 0.5 });
      g.position.set(x, y);
      g.scale.set(1, TILT);
      c.addChild(g);
    }
    return c;
  }

  /** Behind the island: guilloche wave ribbons, the 1° graticule and the neighbours' coasts. */
  private drawSeaDecor(): Container {
    const c = new Container();
    // Banknote-style guilloche ribbons: interlaced sine waves across the open sea.
    const waves = new Graphics();
    const x0 = -1200;
    const x1 = WORLD.width + 1200;
    for (const [yc, amp, len] of [
      [WORLD.height * 0.62, 34, 260],
      [WORLD.height * 0.93, 26, 210],
      [WORLD.height * 0.18, 22, 300],
    ] as const) {
      for (let k = 0; k < 7; k++) {
        const phase = (k / 7) * Math.PI * 2;
        for (let x = x0; x <= x1; x += 8) {
          const y = yc + Math.sin((x / len) * Math.PI * 2 + phase) * amp + Math.sin((x / (len * 0.37)) * Math.PI * 2 - phase) * amp * 0.25;
          if (x === x0) waves.moveTo(x, y);
          else waves.lineTo(x, y);
        }
      }
    }
    waves.stroke({ width: 0.8, color: V.mint, alpha: V.lineAlpha * 2.2 });
    // 1° latitude / longitude lines, like an engraved chart.
    const grid = new Graphics();
    for (const line of GRATICULE) grid.poly(line.flat(), false);
    grid.stroke({ width: 0.9, color: V.mint, alpha: V.lineAlpha * 2.4 });
    // Neighbouring coasts: faint land, one echo contour, no buildings.
    const near = new Graphics();
    for (const ring of NEIGHBOURS) near.poly(ring.flat()).stroke({ width: 18, color: V.mint, alpha: 0.07, join: "round" });
    for (const ring of NEIGHBOURS) near.poly(ring.flat()).fill({ color: mix(V.void, V.forest, 0.55) }).stroke({ width: 1, color: V.mint, alpha: 0.45, join: "round" });
    const nearHatch = new Graphics();
    for (let x = -WORLD.height - 1200; x < WORLD.width + 1200; x += 11) nearHatch.moveTo(x, -900).lineTo(x + WORLD.height + 1800, WORLD.height + 900);
    nearHatch.stroke({ width: 0.7, color: V.mint, alpha: V.lineAlpha * 1.6 });
    const nearMask = new Graphics();
    for (const ring of NEIGHBOURS) nearMask.poly(ring.flat()).fill(0xffffff);
    nearHatch.mask = nearMask;
    c.addChild(waves, grid, near, nearMask, nearHatch);
    return c;
  }

  /** In open sea: a guilloche compass rose and a few rosette ornaments. */
  private drawOrnaments(): Container {
    const c = new Container();
    for (const [x, y] of ORNAMENTS) {
      const g = new Graphics();
      rosette(g, 0, 0, 64, 20, V.mint, 0.8, 0.35);
      rosette(g, 0, 0, 44, 14, V.mint, 0.6, 0.25);
      g.circle(0, 0, 70).stroke({ width: 0.8, color: V.mint, alpha: 0.3 });
      g.position.set(x, y);
      g.scale.set(1, TILT);
      c.addChild(g);
    }
    const g = new Graphics();
    rosette(g, 0, 0, 120, 36, V.mint, 1, 0.45);
    rosette(g, 0, 0, 88, 24, V.mint, 0.8, 0.35);
    g.circle(0, 0, 130).stroke({ width: 1.2, color: V.mint, alpha: 0.6 });
    g.circle(0, 0, 136).stroke({ width: 0.6, color: V.mint, alpha: 0.45 });
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const r1 = k % 8 === 0 ? 142 : 136;
      g.moveTo(Math.cos(a) * 130, Math.sin(a) * 130).lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    }
    g.stroke({ width: 0.8, color: V.mint, alpha: 0.6 });
    // Eight-point star: long N/S/E/W points, short diagonals.
    const star = (len: number, w: number, rot: number, alpha: number) => {
      for (let q = 0; q < 4; q++) {
        const a = rot + (q * Math.PI) / 2;
        const tip = [Math.cos(a) * len, Math.sin(a) * len];
        const l = [Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w];
        const r = [Math.cos(a - Math.PI / 2) * w, Math.sin(a - Math.PI / 2) * w];
        g.poly([0, 0, l[0], l[1], tip[0], tip[1]]).fill({ color: V.mint, alpha });
        g.poly([0, 0, r[0], r[1], tip[0], tip[1]]).fill({ color: mix(V.mint, V.void, 0.45), alpha });
      }
    };
    star(84, 9, Math.PI / 4, 0.5);
    star(150, 14, -Math.PI / 2, 0.85);
    g.circle(0, 0, 6).fill(V.void).stroke({ width: 1, color: V.mint });
    g.position.set(COMPASS[0], COMPASS[1]);
    g.scale.set(1, TILT);
    c.addChild(g);
    return c;
  }

  private makeLandmarks() {
    const mk = (key: string, draw: (g: Graphics) => void, p: Pt, realKey: string, width: number) => {
      const real = this.realTexture(realKey);
      const baked = real
        ? this.bake(`real_${realKey}`, (c) => {
            const s = new Sprite(real);
            s.anchor.set(0.5, 0.85);
            s.scale.set(width / real.width);
            c.addChild(s);
          })
        : this.bake(key, (c) => {
            const g = new Graphics();
            draw(g);
            c.addChild(g);
          });
      this.place(baked, p, LANDMARK_SCALE);
    };
    mk("duomo", drawDuomo, PLACES.milano, "landmark_0", 110);
    mk("colosseum", drawColosseum, PLACES.roma, "landmark_1", 110);
    const [vx, vy] = PLACES.napoli;
    mk("vesuvius", drawVesuvius, [vx + 30, vy + 20], "landmark_2", 150);
    mk("campanile", drawCampanile, PLACES.venezia, "landmark_3", 90);
    mk("mayor", drawMayor, PLACES.mayor, "mayor", 80);
    if (!this.realTexture("landmark_2")) this.emitters.push({ p: [vx + 30, vy + 20 - 78 * LANDMARK_SCALE], rate: 2.2, acc: 0, big: true });
  }

  /** Fill every empty bit of land with countryside: cottages, cypresses and olive trees.
   *  Scenery makes way wherever a real building is placed. */
  private makeTrees() {
    const kinds = [0, 1, 2].map((k) => this.bake(`tree${k}`, (c) => {
      const g = new Graphics();
      drawTree(g, k);
      c.addChild(g);
    }));
    const cottages = [0, 1, 2].map((k) => this.bake(`cottage${k}`, (c) => {
      const g = new Graphics();
      drawCottage(g, k);
      c.addChild(g);
    }));
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const step = PLOT_SPACING * 0.62;
    const plazas = [PLACES.mayor, ...DISTRICT_PLACES.map((k) => PLACES[k])];
    for (let y = 10, row = 0; y < WORLD.height; y += step * TILT * 0.9, row++) {
      for (let x = 10 + (row % 2) * step * 0.5; x < WORLD.width; x += step) {
        const p: Pt = [x + (rnd() - 0.5) * step * 0.6, y + (rnd() - 0.5) * step * 0.4];
        if (!onLand(p[0], p[1]) || !onLand(p[0] + 12, p[1]) || !onLand(p[0] - 12, p[1])) continue;
        if (plazas.some((c) => Math.hypot(p[0] - c[0], (p[1] - c[1]) / TILT) < 150)) continue;
        const r = rnd();
        const baked = r < 0.42 ? cottages[Math.floor(rnd() * 3)] : kinds[Math.floor(rnd() * 3)];
        const s = this.place(baked, p, r < 0.42 ? 3 : 2.6 + rnd() * 0.8);
        // A few cottages have a smoking chimney.
        if (r < 0.42 && rnd() < 0.06 && this.emitters.length < 40) {
          this.emitters.push({ p: [p[0] + 4, p[1] - 21 * 3], rate: 0.5, acc: rnd(), big: false });
        }
        const idx = this.trees.push({ s, p }) - 1;
        const key = `${Math.floor(p[0] / 60)},${Math.floor(p[1] / 60)}`;
        (this.treeGrid.get(key) ?? this.treeGrid.set(key, []).get(key)!).push(idx);
      }
    }
  }

  private clearTreesAround(p: Pt) {
    const gx = Math.floor(p[0] / 60);
    const gy = Math.floor(p[1] / 60);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of this.treeGrid.get(`${gx + dx},${gy + dy}`) ?? []) {
          const t = this.trees[i];
          if (t.s.visible && Math.hypot(t.p[0] - p[0], (t.p[1] - p[1]) / TILT) < 46) t.s.visible = false;
        }
      }
    }
  }

  private seaPoint(p: Pt, margin: number): boolean {
    for (const [dx, dy] of [
      [0, 0],
      [margin, 0],
      [-margin, 0],
      [0, margin],
      [0, -margin],
    ]) {
      if (onAnyLand(p[0] + dx, p[1] + dy)) return false;
    }
    return true;
  }

  private makeWaves(layer: Container) {
    const tex = this.bakeTexture((g) =>
      g.moveTo(-8, 0).quadraticCurveTo(-4, -3, 0, 0).quadraticCurveTo(4, -3, 8, 0).stroke({ width: 1.4, color: V.mint, cap: "round" }),
    );
    let tries = 0;
    while (this.waves.length < 140 && tries++ < 3000) {
      const p: Pt = [Math.random() * (WORLD.width + 400) - 200, Math.random() * (WORLD.height + 300) - 150];
      if (!this.seaPoint(p, 28)) continue;
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.scale.set(K * 3);
      s.position.set(p[0], p[1]);
      s.alpha = 0;
      layer.addChild(s);
      this.waves.push({ s, t: Math.random() * 6, period: 4 + Math.random() * 4 });
    }
  }

  private makeBoats(layer: Container) {
    const sails = inks();
    const orbitOk = (c: Pt, r: number) => {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        if (!this.seaPoint([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * TILT], 45)) return false;
      }
      return true;
    };
    let tries = 0;
    while (this.boats.length < 8 && tries++ < 4000) {
      const c: Pt = [Math.random() * WORLD.width, Math.random() * WORLD.height];
      const r = 90 + Math.random() * 160;
      if (!orbitOk(c, r)) continue;
      const tex = this.bake(`boat${this.boats.length % sails.length}`, (cc) => {
        const g = new Graphics();
        drawBoat(g, sails[this.boats.length % sails.length]);
        cc.addChild(g);
      });
      const s = new Sprite(tex.texture);
      s.anchor.set(tex.ax, tex.ay);
      s.scale.set(K * 3.2);
      layer.addChild(s);
      this.boats.push({ s, c, r, a: Math.random() * Math.PI * 2, speed: (0.04 + Math.random() * 0.05) * (Math.random() < 0.5 ? -1 : 1), sq: TILT });
    }
    // gondola in the Venetian lagoon
    const v = PLACES.venezia;
    for (let k = 0; k < 400; k++) {
      const c: Pt = [v[0] + 20 + Math.random() * 90, v[1] - 40 + Math.random() * 90];
      if (!orbitOk(c, 30)) continue;
      const tex = this.bake("gondola", (cc) => {
        const g = new Graphics();
        drawGondola(g);
        cc.addChild(g);
      });
      const s = new Sprite(tex.texture);
      s.anchor.set(tex.ax, tex.ay);
      s.scale.set(K * 3.2);
      layer.addChild(s);
      this.boats.push({ s, c, r: 30, a: 0, speed: 0.12, sq: TILT });
      break;
    }
  }

  private makeClouds() {
    for (let i = 0; i < 7; i++) {
      const c = new Container();
      const shadow = new Graphics();
      shadow.visible = false;
      const g = new Graphics();
      drawCloud(g);
      g.alpha = 0.92;
      c.addChild(shadow, g);
      c.position.set(Math.random() * WORLD.width, Math.random() * WORLD.height);
      c.scale.set(0.8 + Math.random() * 0.9);
      this.clouds.addChild(c);
      this.cloudList.push({ s: c, speed: 6 + Math.random() * 8 });
    }
  }

  // ─────────── buildings ───────────

  /** Remove every building (e.g. when switching between sample data and a test city). */
  reset() {
    // Stop running pop-in / level-up animations before their sprites go away.
    this.tweens = this.camTween ? [this.camTween] : [];
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    this.levels.clear();
    this.buildingsById.clear();
    for (const t of this.trees) t.s.visible = true;
    this.select(null);
  }

  /** Bring the map in line with the building list. New ids pop in when `animate` is true. */
  sync(buildings: Building[], animate: boolean) {
    this.inviters = [];
    for (const b of buildings) {
      this.buildingsById.set(b.id, b);
      if (b.invites >= 2) this.inviters.push(b.id);
      const level = levelForUsd(b.claimedUsd);
      const s = this.sprites.get(b.id);
      if (!s) {
        this.addBuilding(b, animate);
      } else if (this.levels.get(b.id) !== level) {
        this.setLevel(b, level, animate);
      }
    }
    this.updateMarkers(buildings);
  }

  private addBuilding(b: Building, animate: boolean) {
    const level = levelForUsd(b.claimedUsd);
    const p = plotPosition(b.district, b.plot);
    const s = this.place(this.buildingTexture(b.district, b.style, level), p, BUILDING_SCALE);
    this.sprites.set(b.id, s);
    this.spriteCity.set(b.id, b.district);
    this.levels.set(b.id, level);
    this.clearTreesAround(p);
    if (!animate || this.reducedMotion) return;
    s.scale.set(0);
    const k = this.base.get(s)!;
    this.tween(650, (t) => s.scale.set(k * Math.max(0, easeOutBack(t))));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.spawn(p[0], p[1], Math.cos(a) * 120, Math.sin(a) * 50 - 20, 0, 0.8, V.mint, 1.5, 2.5, undefined, 0.3);
    }
  }

  private setLevel(b: Building, level: number, animate: boolean) {
    const s = this.sprites.get(b.id)!;
    this.levels.set(b.id, level);
    const baked = this.buildingTexture(b.district, b.style, level);
    s.texture = baked.texture;
    s.anchor.set(baked.ax, baked.ay);
    if (!animate || this.reducedMotion) return;
    const k = this.base.get(s)!;
    this.tween(700, (t) => {
      s.scale.set(k * (1 + 0.12 * Math.sin(t * Math.PI) * (1 - t)), k * (0.75 + 0.25 * easeOutBack(t)));
    });
    for (let k = 0; k < 10; k++) {
      this.spawn(s.x + (Math.random() - 0.5) * 100, s.y - 50 - Math.random() * 130, (Math.random() - 0.5) * 70, -100 - Math.random() * 80, 0, 1.1, V.mint, 1.2, 0, this.star);
    }
  }

  private updateMarkers(buildings: Building[]) {
    const counts = DISTRICTS.map(() => 0);
    for (const b of buildings) counts[b.district] = Math.max(counts[b.district], b.plot + 1);
    if (this.markers.length === 0) {
      for (let d = 0; d < DISTRICTS.length; d++) {
        const baked = this.bake(`plot${d}`, (c) => {
          const g = new Graphics();
          drawEmptyPlot(g, cityInk(d));
          c.addChild(g);
        });
        const s = this.place(baked, [0, 0], BUILDING_SCALE);
        s.zIndex = -1;
        this.markers.push(s);
      }
    }
    this.markers.forEach((m, d) => {
      const p = plotPosition(d, counts[d]);
      m.position.set(p[0], p[1]);
    });
  }

  /** A purchase: rings over every city, sparkles from the landmarks and glints on rooftops,
   *  all in the bought token's ink — every building in every city shares it. */
  /** Rings and sparkles in a token's ink over the cities that just received it. */
  celebrate(color: number, cities: number[] = DISTRICT_PLACES.map((_, i) => i)) {
    if (this.reducedMotion) return;
    const places = cities.map((i) => PLACES[DISTRICT_PLACES[i]]);
    for (const [x, y] of places) {
      const ring = new Graphics();
      ring.circle(0, 0, 150).stroke({ width: 3, color });
      rosette(ring, 0, 0, 150, 24, color, 1.2, 0.8);
      ring.position.set(x, y);
      ring.scale.set(0.5, 0.5 * TILT);
      this.fx.addChild(ring);
      this.tween(1400, (p) => {
        const k = 0.5 + p * 0.9;
        ring.scale.set(k, k * TILT);
        ring.alpha = 1 - p;
      }, () => ring.destroy());
      for (let k = 0; k < 18; k++) {
        this.spawn(x + (Math.random() - 0.5) * 220, y - Math.random() * 120, (Math.random() - 0.5) * 40, -90 - Math.random() * 90, 0, 1.6, color, 1, 0, this.star, 0.9);
      }
    }
    const sprites = [...this.sprites.entries()].filter(([id]) => cities.includes(this.spriteCity.get(id) ?? -1)).map(([, sp]) => sp);
    for (let k = 0; k < Math.min(90, sprites.length); k++) {
      const sp = sprites[Math.floor(Math.random() * sprites.length)];
      this.spawn(sp.x, sp.y - sp.height * 0.8, 0, -70 - Math.random() * 40, 0, 1.3, color, 0.7, 0, this.star, 0.85);
    }
  }

  burstAt(id: number) {
    const s = this.sprites.get(id);
    if (!s) return;
    const colours = inks();
    const top = s.y - s.height - 20;
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      const v = 40 + Math.random() * 20;
      this.spawn(s.x, top, Math.cos(a) * v * 3.5, Math.sin(a) * v * 3.5, 100, 1.3, colours[k % colours.length], 0.8, 0);
    }
  }

  // ─────────── particles & tweens ───────────

  private spawn(x: number, y: number, vx: number, vy: number, g: number, life: number, color: number, scale: number, grow: number, tex?: Texture, alpha = 1) {
    const s = this.pool.pop() ?? new Sprite();
    s.texture = tex ?? this.dot;
    s.anchor.set(0.5);
    s.tint = color;
    s.position.set(x, y);
    s.scale.set(scale);
    s.alpha = 1;
    s.visible = true;
    this.fx.addChild(s);
    this.particles.push({ s, vx, vy, g, life, max: life, grow, alpha });
  }

  private tween(ms: number, step: (p: number) => void, done?: () => void): Tween {
    const t = { t: 0, dur: ms / 1000, step, done };
    this.tweens.push(t);
    step(0);
    return t;
  }

  private update(dt: number) {
    dt = Math.min(dt, 0.05);
    const motion = !this.reducedMotion;
    this.tweens = this.tweens.filter((tw) => {
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.step(p);
      if (p >= 1) tw.done?.();
      return p < 1;
    });
    if (this.camTween && !this.tweens.includes(this.camTween)) this.camTween = null;

    this.particles = this.particles.filter((pt) => {
      pt.life -= dt;
      pt.vy += pt.g * dt;
      pt.s.x += pt.vx * dt;
      pt.s.y += pt.vy * dt;
      pt.s.scale.set(pt.s.scale.x + pt.grow * dt);
      pt.s.alpha = Math.max(0, pt.life / pt.max) * pt.alpha;
      if (pt.life > 0) return true;
      pt.s.visible = false;
      this.fx.removeChild(pt.s);
      this.pool.push(pt.s);
      return false;
    });

    if (!motion) return;
    const time = performance.now() / 1000;
    for (const w of this.waves) {
      w.t += dt;
      const ph = (w.t % w.period) / w.period;
      w.s.alpha = Math.sin(ph * Math.PI) * 0.4;
      w.s.x += dt * 2;
    }
    for (const b of this.boats) {
      b.a += b.speed * dt;
      const x = b.c[0] + Math.cos(b.a) * b.r;
      const y = b.c[1] + Math.sin(b.a) * b.r * b.sq;
      const dir = -Math.sin(b.a) * b.speed;
      b.s.scale.x = (dir >= 0 ? 1 : -1) * K * 3.2;
      b.s.scale.y = K * 3.2;
      b.s.position.set(x, y + Math.sin(time * 2 + b.r) * 1.2);
      b.s.rotation = Math.sin(time * 1.6 + b.r) * 0.04;
    }
    for (const c of this.cloudList) {
      c.s.x += c.speed * dt;
      if (c.s.x > WORLD.width + 200) c.s.x = -200;
    }
    this.clouds.alpha = Math.max(0, Math.min(1, 1.6 - this.world.scale.x));
    for (const e of this.emitters) {
      e.acc += dt * e.rate;
      while (e.acc >= 1) {
        e.acc -= 1;
        this.spawn(e.p[0] + (Math.random() - 0.5) * 4, e.p[1], (Math.random() - 0.2) * 6, e.big ? -40 : -25, 0, e.big ? 4.5 : 2.4, e.big ? V.muted : V.ivory, e.big ? 2 : 0.7, e.big ? 1 : 0.5, undefined, e.big ? 0.22 : 0.3);
      }
    }
    this.fireworkAcc += dt;
    if (this.fireworkAcc > 2.4 && this.inviters.length) {
      this.fireworkAcc = 0;
      this.burstAt(this.inviters[Math.floor(Math.random() * this.inviters.length)]);
    }
    for (const m of this.markers) m.alpha = 0.6 + 0.4 * Math.sin(time * 3);
    if (this.ring.visible) this.ring.scale.set(1 + 0.12 * Math.sin(time * 5));
  }

  // ─────────── camera ───────────

  /** Screen area not covered by the header/stats (top) and tab bar (bottom). */
  private viewport() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    const top = w >= 900 ? 165 : w < 420 ? 160 : 170;
    const bottom = w >= 900 ? 96 : 76;
    return { w, h, top, bottom, cx: w >= 900 && ui.panelOpen ? (w - 450) / 2 : w / 2 };
  }


  private landBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of RINGS) for (const [x, y] of r) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return { x0, y0: y0 - 160, x1, y1: y1 + 30 }; // room for the northern banners and the cliff
  }

  fitScale = 0.2;

  /** Zoom so the whole island fills the free part of the screen. */
  fit() {
    const { w, h, top, bottom } = this.viewport();
    const b = this.landBounds();
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    const s = Math.min((w - 16) / bw, (h - top - bottom) / bh);
    this.fitScale = s;
    this.world.scale.set(s);
    this.world.position.set((w - bw * s) / 2 - b.x0 * s, top + (h - top - bottom - bh * s) / 2 - b.y0 * s);
    this.cb.onCamera();
  }

  getCamera(): { x: number; y: number; s: number } | null {
    if (!this.el || !this.world.scale) return null;
    return { x: this.world.x, y: this.world.y, s: this.world.scale.x };
  }

  setCamera(c: { x: number; y: number; s: number }) {
    this.world.scale.set(c.s);
    this.world.position.set(c.x, c.y);
    this.cb.onCamera();
  }

  worldToScreen(p: Pt): Pt {
    return [p[0] * this.world.scale.x + this.world.x, p[1] * this.world.scale.y + this.world.y];
  }

  get scale() {
    return this.world.scale.x;
  }

  private zoomAt(sx: number, sy: number, next: number) {
    const s = Math.max(this.fitScale * 0.8, Math.min(this.fitScale * 12, next));
    const k = s / this.world.scale.x;
    this.world.position.set(sx - (sx - this.world.x) * k, sy - (sy - this.world.y) * k);
    this.world.scale.set(s);
    this.clamp();
  }

  private clamp() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    const s = this.world.scale.x;
    const minX = w * 0.5 - WORLD.width * s;
    const maxX = w * 0.5;
    const minY = h * 0.5 - WORLD.height * s;
    const maxY = h * 0.5;
    this.world.x = Math.max(minX, Math.min(maxX, this.world.x));
    this.world.y = Math.max(minY, Math.min(maxY, this.world.y));
    this.cb.onCamera();
  }

  select(id: number | null) {
    const s = id === null ? undefined : this.sprites.get(id);
    this.ring.visible = !!s;
    if (s) this.ring.position.set(s.x, s.y);
  }

  flyTo(id: number, scale = 0.9) {
    const s = this.sprites.get(id);
    if (!s) return;
    const { h, top, bottom, cx } = this.viewport();
    const from = { x: this.world.x, y: this.world.y, s: this.world.scale.x };
    const to = { s: scale, x: cx - s.x * scale, y: top + (h - top - bottom) * 0.55 - (s.y - 10) * scale };
    if (this.camTween) this.tweens = this.tweens.filter((t) => t !== this.camTween);
    this.camTween = this.tween(this.reducedMotion ? 1 : 900, (p) => {
      const e = easeInOut(p);
      this.world.scale.set(from.s + (to.s - from.s) * e);
      this.world.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      this.cb.onCamera();
    });
  }

  private bindInput() {
    const c = this.app.canvas;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = local(e);
      this.zoomAt(p.x, p.y, this.world.scale.x * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.camTween) {
        this.tweens = this.tweens.filter((t) => t !== this.camTween);
        this.camTween = null;
      }
      if (this.pointers.size === 1) this.dragStart = { ...p, t: performance.now(), moved: false };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: this.world.scale.x, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        if (this.dragStart) this.dragStart.moved = true;
      }
    });
    c.addEventListener("pointermove", (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        this.world.x += cx - this.pinch.cx;
        this.world.y += cy - this.pinch.cy;
        this.pinch.cx = cx;
        this.pinch.cy = cy;
        this.zoomAt(cx, cy, this.pinch.scale * (d / this.pinch.d));
        return;
      }
      if (this.dragStart && Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y) > 6) this.dragStart.moved = true;
      this.world.x += p.x - prev.x;
      this.world.y += p.y - prev.y;
      this.clamp();
    });
    const end = (e: PointerEvent) => {
      const p = local(e);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0 && this.dragStart) {
        if (!this.dragStart.moved && performance.now() - this.dragStart.t < 500) this.tap(p.x, p.y);
        this.dragStart = null;
      }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  private tap(sx: number, sy: number) {
    const wx = (sx - this.world.x) / this.world.scale.x;
    const wy = (sy - this.world.y) / this.world.scale.y;
    let best: number | null = null;
    let bestZ = -Infinity;
    for (const [id, s] of this.sprites) {
      const b = s.getLocalBounds();
      const x0 = s.x + b.x * s.scale.x;
      const y0 = s.y + b.y * s.scale.y;
      if (wx >= x0 && wx <= x0 + b.width * s.scale.x && wy >= y0 && wy <= y0 + b.height * s.scale.y && s.zIndex > bestZ) {
        best = id;
        bestZ = s.zIndex;
      }
    }
    this.select(best);
    this.cb.onSelect(best);
  }
}
