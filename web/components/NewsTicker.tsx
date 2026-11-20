"use client";

import { useEffect, useState } from "react";
import { useFeed } from "../lib/feed";
import { useCity } from "../lib/store";

/** Breaking-news ticker above the tab bar. Turns red when buying is paused ("heat"). */
export default function NewsTicker() {
  const posts = useFeed();
  const city = useCity();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  // On chain: the vault's pause after a rejected buy. Preview: ?heat=1 shows the effect.
  const [demoUntil] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("heat") ? Math.floor(Date.now() / 1000) + 8040 : 0,
  );
  const pausedUntil = city.chain?.pausedUntil ?? demoUntil;
  const hot = pausedUntil > now;
  const left = pausedUntil - now;
  const items = hot
    ? [`HEAT IS ON. A bad fill was turned down; the city lies low for ${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m. Nobody's money moved.`]
    : posts.slice(0, 6).map((p) => `${p.handle}: ${p.text}`);
  const line = items.join("   ·   ");
  return (
    <div className={`ticker ${hot ? "hot" : ""}`} role="status">
      <span className="ticker-label">{hot ? "HEAT" : "BREAKING"}</span>
      <div className="ticker-track">
        <span key={line}>{line}   ·   {line}</span>
      </div>
    </div>
  );
}
