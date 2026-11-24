"use client";

import { ink } from "../lib/theme";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import MapView from "./MapView";
import Providers from "./Providers";
import TestLab from "./TestLab";
import WalletButton from "./WalletButton";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "../lib/theme";
import { chainError, connectCity, isLiveCity, savedCity } from "../lib/chain";
import Logo from "./Logo";
import { FeedPanel, FeedTab } from "./Feed";
import Guide from "./Guide";
import WhitePaper from "./WhitePaper";
import { BuildTab, MyPalazzoTab, RankingsTab, SindacoTab, TreasuryTab } from "./Panels";
import { DISTRICTS, GAME, LIVE, MAX_BUILDINGS, PRELAUNCH, TICKER } from "../lib/config";
import { getCity, onCityEvent, setLive, setMode, settleIfDue, tick, ui, useCity } from "../lib/store";

const TABS = [
  { key: "build", label: "Build", icon: "" },
  { key: "mine", label: "My Palazzi", icon: "" },
  { key: "feed", label: "Live", icon: "" },
  { key: "rank", label: "Rankings", icon: "" },
  { key: "treasury", label: "Treasury", icon: "" },
  { key: "paper", label: "White Paper", icon: "" },
  { key: "sindaco", label: "Il Sindaco", icon: "" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const compact = (n: number) =>
  n.toLocaleString("en-US", { notation: n >= 100_000 ? "compact" : "standard", maximumFractionDigits: n >= 100_000 ? 1 : 2 });

export default function App() {
  return (
    <Providers>
      <Game />
    </Providers>
  );
}

/** Keeps the store in step with the wallet and the loaded test city. */
function ChainSync() {
  const city = useCity();
  const { address } = useAccount();
  useEffect(() => {
    if (city.mode !== "testnet") {
      connectCity(null, null);
      return;
    }
    connectCity(savedCity(), address ?? null).catch(() => {});
  }, [city.mode, address]);
  return null;
}

function Game() {
  const city = useCity();
  useTheme(); // re-render every panel when the theme changes (city and token inks)
  const [tab, setTab] = useState<TabKey | null>(null);
  const [lab, setLab] = useState(false);
  // Triple click / tap detection on the mode chip (counted by hand so touch screens work too).
  // Times come from the event itself (when the finger touched), so a busy frame cannot
  // stretch the gaps; the single-click action waits until the tapping stops.
  const taps = useRef<number[]>([]);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onModeChipClick = (e: React.MouseEvent) => {
    const now = e.timeStamp;
    taps.current = [...taps.current.filter((t) => now - t < 1500), now];
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    if (taps.current.length >= 3) {
      taps.current = [];
      setLab(true);
      return;
    }
    // Single click: pause / resume the sample activity (preview only).
    pending.current = setTimeout(() => {
      pending.current = null;
      if (getCity().mode === "preview") setLive(!getCity().live);
    }, 450);
  };
  const [copied, setCopied] = useState(false);

  // "Show on map" (and tapping a palazzo in a list) flies the camera there: close the panel so
  // the move and the building are visible.
  useEffect(() => onCityEvent((e) => { if (e.type === "focus") setTab(null); }), []);

  useEffect(() => {
    // After launch the real city loads by default; a shared test-city link (?city=0x…) opens that one.
    if (LIVE.vault || new URLSearchParams(window.location.search).get("city")) setMode("testnet");
    const a = setInterval(tick, 3200);
    const b = setInterval(() => settleIfDue(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  ui.panelOpen = tab !== null;
  // The real city (after launch), also while it is still loading.
  const liveCity = city.chain ? isLiveCity(city.chain.vault) : !!LIVE.vault && typeof window !== "undefined" && !new URLSearchParams(window.location.search).get("city");
  // The city leading this week's street race (most new palazzi; none on a tie).
  const top = Math.max(0, ...city.newBuilds);
  const leader = top > 0 && city.newBuilds.filter((n) => n === top).length === 1 ? DISTRICTS[city.newBuilds.indexOf(top)] : null;
  const current = TABS.find((t) => t.key === tab);

  return (
    <main className="app">
      <ChainSync />
      <MapView />

      <header className="top">
        <div className="token-card">
          <div className="token-name">{TICKER}</div>
          <div className="ca-row">
          <button
            className="ca"
            onClick={() => {
              if (LIVE.capitale) navigator.clipboard?.writeText(LIVE.capitale).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            CA: {LIVE.capitale ? (copied ? "copied" : `${LIVE.capitale.slice(0, 6)}…${LIVE.capitale.slice(-4)}`) : copied ? "announced at launch" : "coming soon"}
          </button>
            {GAME.x && (
              <a className="x-link" href={GAME.x} target="_blank" rel="noreferrer" aria-label={`${GAME.name} on X`} title={`${GAME.xHandle ?? GAME.name} on X`}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden>
                  <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2Z" />
                </svg>
              </a>
            )}
          </div>
          <div className="via">via <b>Montra</b> · Elysium</div>
        </div>
        <div className="top-right">
          <Logo />
          <div className="row-tight">
            <ThemeToggle />
            <WalletButton />
          </div>
        </div>
      </header>

      <section className="stats">
        <div className="stat"><span>Residents</span><b>{city.buildings.length.toLocaleString()}<small>/{MAX_BUILDINGS.toLocaleString()}</small></b></div>
        <div className="stat"><span>City tax</span><b>{compact(city.totalTax)} <small>HYPE</small></b></div>
        <div className="stat"><span>Purchases</span><b>{city.totalPurchases}</b></div>
        <div className="stat" style={leader ? { ["--c" as string]: ink(leader) } : undefined}><span>Leading this week</span><b className="week-token">{leader ? leader.city : "Tied"}</b></div>
        {/* Test mode is hidden: a triple click / tap on this chip opens the test lab. */}
        <button className={`stat live ${city.mode === "testnet" || city.live ? "on" : ""}`} onClick={onModeChipClick}>
          {city.mode === "preview" ? (
            <>
              <span>{PRELAUNCH ? GAME.name : "Sample data"}</span>
              <b>{PRELAUNCH ? "Opening soon" : city.live ? "● Live" : "Paused"}</b>
            </>
          ) : (
            <>
              <span>{liveCity ? GAME.name : "Test city"}</span>
              <b title={chainError() ?? undefined}>● {liveCity ? (city.chain ? "Live" : chainError() ? "Can't reach Elysium" : "Loading") : "On chain"}</b>
            </>
          )}
        </button>
      </section>

      <section className={`sheet ${tab ? "open" : ""}`} aria-hidden={!tab}>
        {current && (
          <>
            <div className="sheet-head">
              <h2>{current.label}</h2>
              <button className="close" onClick={() => setTab(null)} aria-label="Close">×</button>
            </div>
            <div className="sheet-body">
              {tab === "feed" && <FeedTab />}
              {tab === "build" && <BuildTab />}
              {tab === "mine" && <MyPalazzoTab />}
              {tab === "rank" && <RankingsTab />}
              {tab === "treasury" && <TreasuryTab />}
              {tab === "paper" && <WhitePaper />}
              {tab === "sindaco" && <SindacoTab />}
            </div>
          </>
        )}
      </section>

      {lab && (
        <div className="lab-dialog" role="dialog" aria-modal="true" aria-label="Test lab" onClick={(e) => e.target === e.currentTarget && setLab(false)}>
          <div className="lab-panel">
            <div className="sheet-head">
              <h2>Test lab</h2>
              {city.mode === "testnet" && (
                <button className="btn small" onClick={() => setMode("preview")}>Back to preview</button>
              )}
              <button className="close" onClick={() => setLab(false)} aria-label="Close">×</button>
            </div>
            <div className="sheet-body">
              <TestLab />
            </div>
          </div>
        </div>
      )}

      {!tab && <Guide onTab={(t) => setTab(t)} />}
      <FeedPanel />

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(tab === t.key ? null : t.key)}>
            <span className="ti">{t.icon}</span>
            <span className="tl">{t.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
