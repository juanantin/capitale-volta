// Generates Capitale's app icon (app/icon.svg) in Volta's engraved look:
// forest plate, mint guilloche rosettes, a small palazzo with a domed tower and the star.
import { writeFileSync } from "node:fs";

const FOREST = "#0b2a21", MINT = "#80e3ba", DEEP = "#08201a";
function rosette(cx, cy, r, petals, inner) {
  const steps = petals * 40;
  let d = "";
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * Math.PI * 2;
    const rr = r * inner + (r - r * inner) * Math.abs(Math.sin((petals * t) / 2));
    d += `${k ? "L" : "M"}${(cx + Math.cos(t) * rr).toFixed(1)} ${(cy + Math.sin(t) * rr).toFixed(1)}`;
  }
  return d + "Z";
}
const cx = 256, cy = 256;
// Palazzo: wide base with arches, a pediment, a drum and a dome, the four-point star on top.
const arches = [0, 1, 2, 3, 4].map((i) => {
  const x = 176 + i * 32;
  return `<path d="M${x} 352 V328 a10 10 0 0 1 20 0 V352Z" fill="${DEEP}"/>`;
}).join("");
const windows = [0, 1, 2, 3, 4].map((i) => `<rect x="${179 + i * 32}" y="292" width="14" height="18" fill="${DEEP}"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="${FOREST}"/>
<rect x="22" y="22" width="468" height="468" fill="none" stroke="${MINT}" stroke-width="3" opacity="0.55"/>
<path d="${rosette(cx, cy, 214, 28, 0.86)}" fill="none" stroke="${MINT}" stroke-width="3" opacity="0.5"/>
<path d="${rosette(cx, cy, 196, 20, 0.8)}" fill="none" stroke="${MINT}" stroke-width="4" opacity="0.85"/>
<circle cx="${cx}" cy="${cy}" r="150" fill="none" stroke="${MINT}" stroke-width="3" opacity="0.6"/>
<g fill="${MINT}">
  <rect x="160" y="320" width="192" height="40"/>
  <rect x="166" y="282" width="180" height="38"/>
  <path d="M156 282 L256 244 L356 282Z"/>
  <rect x="226" y="214" width="60" height="30"/>
  <path d="M220 216 a36 36 0 0 1 72 0Z"/>
  <path d="M256 128 C259 152 262 156 280 160 C262 164 259 168 256 192 C253 168 250 164 232 160 C250 156 253 152 256 128Z"/>
  <rect x="150" y="360" width="212" height="8"/>
</g>
${arches}${windows}
<g fill="${DEEP}"><rect x="234" y="222" width="8" height="18"/><rect x="252" y="222" width="8" height="18"/><rect x="270" y="222" width="8" height="18"/></g>
</svg>
`;
writeFileSync(new URL("../app/icon.svg", import.meta.url), svg);
console.log("app/icon.svg written");
