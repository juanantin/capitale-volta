// Capitale's mark in Volta's language: a guilloche rosette with a four-point star,
// next to the name set in Cormorant Garamond.

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

/** Riviera theme: a low sun over the sea instead of the guilloche rosette. */
function Sun({ size = 40 }: { size?: number }) {
  return (
    <svg className="sun" width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="sunfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd36e" />
          <stop offset="1" stopColor="#ff5c8a" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="22" r="14" fill="url(#sunfill)" />
      <rect x="0" y="27" width="40" height="3" fill="var(--void)" />
      <rect x="0" y="32" width="40" height="2" fill="var(--void)" />
      <rect x="0" y="36" width="40" height="4" fill="var(--void)" />
    </svg>
  );
}

export default function Logo() {
  return (
    <div className="logo" role="img" aria-label="Capitale">
      <Sun />
      <span className="logo-word">
        <span className="logo-name">Capitale</span>
        <span className="logo-kicker">Riviera · on Volta</span>
      </span>
    </div>
  );
}
