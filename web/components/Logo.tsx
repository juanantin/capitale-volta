import { GAME } from "../lib/config";

// The game's mark: a guilloche rosette with a four-point star, next to the name.

function rosettePath(cx: number, cy: number, r: number, petals: number, inner = 0.55) {
  const steps = petals * 36;
  let d = "";
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * Math.PI * 2;
    const rr = r * inner + (r - r * inner) * Math.abs(Math.sin((petals * t) / 2));
    d += `${k === 0 ? "M" : "L"}${(cx + Math.cos(t) * rr).toFixed(2)} ${(cy + Math.sin(t) * rr).toFixed(2)}`;
  }
  return d;
}

export function Rosette({ size = 44 }: { size?: number }) {
  return (
    <svg className="rosette" width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d={rosettePath(50, 50, 46, 22)} fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.9" />
      <path d={rosettePath(50, 50, 34, 16, 0.5)} fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.6" />
      <path d="M50 30 C52 45 55 48 70 50 C55 52 52 55 50 70 C48 55 45 52 30 50 C45 48 48 45 50 30Z" fill="currentColor" />
    </svg>
  );
}

export default function Logo() {
  return (
    <div className="logo" role="img" aria-label={GAME.name}>
      <Rosette />
      <span className="logo-word">
        <span className="logo-name">{GAME.name}</span>
        <span className="logo-kicker">{GAME.tagline}</span>
      </span>
    </div>
  );
}
