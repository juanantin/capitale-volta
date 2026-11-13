// Builds lib/italy.json from Natural Earth (world-atlas 50m): Italy's outline projected
// to map pixels, the projected positions of the cities, plus decoration for the sea around
// it: neighbouring coastlines, a 1° graticule, and sea / country label positions.
// Run: node scripts/build-italy.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { geoGraticule, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));
const countries = feature(topo, topo.objects.countries).features;
const italy = countries.find((f) => f.properties.name === "Italy");
if (!italy) throw new Error("Italy not found");

const WIDTH = 2000;
const projection = geoMercator().fitWidth(WIDTH, italy);
const [[, y0], [, y1]] = geoPath(projection).bounds(italy);
const HEIGHT = Math.ceil(y1 - y0);
projection.translate([projection.translate()[0], projection.translate()[1] - y0]);

const area = (r) => Math.abs(r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2);
const polys = italy.geometry.type === "MultiPolygon" ? italy.geometry.coordinates : [italy.geometry.coordinates];
const rings = polys
  .map((poly) => poly[0].map((c) => projection(c).map((v) => Math.round(v * 10) / 10)))
  .filter((r) => area(r) > 900) // drop islets too small to build on
  .sort((a, b) => area(b) - area(a));

const city = (lon, lat) => projection([lon, lat]).map((v) => Math.round(v));
const P = (c) => projection(c).map((v) => Math.round(v));

// Neighbouring coastlines (drawn faintly, no buildings): only polygons near the map.
const MARGIN = 900;
const near = (r) => r.some(([x, y]) => x > -MARGIN && x < WIDTH + MARGIN && y > -MARGIN && y < HEIGHT + MARGIN);
const NEIGHBOURS = ["France", "Switzerland", "Austria", "Slovenia", "Croatia", "Bosnia and Herz.", "Montenegro", "Albania", "Greece", "Tunisia", "Algeria", "Malta", "Germany", "Hungary", "Serbia", "Macedonia", "Liechtenstein", "Monaco", "Kosovo", "Libya"];
const neighbours = [];
for (const f of countries) {
  if (!NEIGHBOURS.includes(f.properties.name)) continue;
  const ps = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const poly of ps) {
    const r = poly[0].map((c) => projection(c).map((v) => Math.round(v)));
    if (near(r) && area(r) > 400) neighbours.push(r);
  }
}

// 1° graticule, as polylines.
const graticule = geoGraticule().step([1, 1]).extent([[0, 33], [23, 50]]).lines()
  .map((l) => l.coordinates.map((c) => projection(c).map((v) => Math.round(v))));
const out = {
  width: WIDTH,
  height: HEIGHT,
  rings,
  places: {
    mayor: city(11.55, 43.55),
    milano: city(9.19, 45.46),
    roma: city(12.5, 41.9),
    napoli: city(14.27, 40.85),
    venezia: city(12.33, 45.44),
    torino: city(7.68, 45.07),
    firenze: city(11.25, 43.77),
    palermo: city(13.36, 38.12),
  },
  neighbours,
  graticule,
  seas: [
    ["Mar Ligure", P([8.3, 43.45])],
    ["Mar Tirreno", P([11.6, 40.2])],
    ["Mar Adriatico", P([16.1, 42.55])],
    ["Mar Ionio", P([18.6, 38.4])],
    ["Canale di Sicilia", P([12.2, 36.9])],
    ["Mare Mediterraneo", P([17.2, 35.1])],
    ["Mar di Sardegna", P([6.3, 39.6])],
  ],
  lands: [
    ["Francia", P([5.6, 45.1])],
    ["Corsica", P([9.1, 42.15])],
    ["Svizzera", P([8.2, 46.85])],
    ["Austria", P([13.4, 47.2])],
    ["Slovenia", P([14.8, 46.1])],
    ["Croazia", P([16.0, 45.0])],
    ["Bosnia", P([17.9, 44.0])],
    ["Albania", P([20.0, 41.0])],
    ["Grecia", P([21.6, 39.5])],
    ["Tunisia", P([9.6, 35.4])],
  ],
  // Spots in open sea for the compass rose and guilloche ornaments.
  ornaments: { compass: P([9.8, 37.6]), rosettes: [P([7.0, 38.6]), P([17.6, 41.9]), P([19.6, 36.9]), P([13.9, 42.6])] },
};
writeFileSync(new URL("../lib/italy.json", import.meta.url), JSON.stringify(out));
console.log(`italy.json: ${WIDTH}x${HEIGHT}, ${rings.length} rings, ${neighbours.length} neighbour rings, ${graticule.length} graticule lines`);
