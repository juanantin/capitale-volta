"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useConnectWallet } from "./WalletSheet";
import { DISTRICTS, GAME, LIVE, MONTRA_URL, PRELAUNCH, TICKER } from "../lib/config";
import { useCity } from "../lib/store";

export type GuideTab = "feed" | "build" | "mine" | "rank" | "treasury" | "paper" | "sindaco";

interface Step {
  key: string;
  title: string;
  text: string;
  action?: { label: string; tab?: GuideTab; href?: string | null; connect?: boolean };
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0, minimumFractionDigits: n < 100 ? 2 : 0 })}`;

/** "Your next move": one suggestion at a time, based on where the player is in the game. */
export default function Guide({ onTab }: { onTab: (t: GuideTab) => void }) {
  const city = useCity();
  const { address, isConnected } = useAccount();
  const { connectWallet } = useConnectWallet();
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("capitale.guide") ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  const step = useMemo<Step | null>(() => {
    if (city.mode !== "testnet") {
      if (!PRELAUNCH) return null; // the preview explains itself
      return {
        key: "soon",
        title: "Opening soon",
        text: `${TICKER} launches on Montra soon. Then 3,000 palazzi open across ${DISTRICTS.map((d) => d.city).join(", ")}, and every trade pays the residents.`,
        action: GAME.x ? { label: "Follow on X", href: GAME.x } : undefined,
      };
    }
    if (!isConnected || !address) {
      return {
        key: "connect",
        title: "Your next move: connect",
        text: `Connect your wallet on Elysium to build a ${GAME.building} and earn.`,
        action: { label: "Connect wallet", connect: true },
      };
    }
    const c = city.chain;
    if (!c || !city.me) return null; // still loading
    const mine = city.buildings.filter((b) => b.owner === city.me);
    const quote = c.quote;
    if (mine.length === 0) {
      if (quote && c.capitaleWei < quote.tokensWei) {
        return {
          key: "buy",
          title: `Your next move: get ${TICKER}`,
          text: `A ${GAME.building} costs ${usd(quote.usd)} right now (about ${fmt(quote.tokens)} ${TICKER}). You hold ${fmt(city.capitaleBalance)}. Buy the rest on Montra, then come back.`,
          action: { label: `Buy ${TICKER} on Montra`, href: `${MONTRA_URL}/token/${LIVE.capitale ?? c.capitale}` },
        };
      }
      return {
        key: "build",
        title: `Your next move: build a ${GAME.building}`,
        text: `Pick a city (${DISTRICTS.map((d) => d.city).join(", ")}). Each city earns its own token, and every ${GAME.building} gets the same share of each purchase.`,
        action: { label: "Build", tab: "build" },
      };
    }
    const pending = mine.reduce((s, b) => s + b.pendingUsd, 0);
    if (pending >= 0.01) {
      return {
        key: `claim-${Math.floor(pending)}`,
        title: `Your next move: collect ${usd(pending)}`,
        text: `Your ${GAME.buildings} have earned tokens. Claiming sends them to your wallet and makes your ${GAME.buildings} taller.`,
        action: { label: "Claim", tab: "mine" },
      };
    }
    const lead = Math.max(...city.newBuilds);
    return {
      key: `grow-${city.week}`,
      title: "Your next move: win the street race",
      text: `The city with the most new ${GAME.buildings} this week wins the street pool${lead > 0 ? "" : " (nobody has built this week yet)"}. Friends can enter your ${GAME.building} number #${mine[0].id} as their inviter when they build.`,
      action: { label: "See the race", tab: "rank" },
    };
  }, [city, isConnected, address]);

  if (!step || dismissed.includes(step.key)) return null;
  const dismiss = () => {
    const next = [...dismissed, step.key];
    setDismissed(next);
    try {
      sessionStorage.setItem("capitale.guide", JSON.stringify(next));
    } catch {
      /* fine */
    }
  };
  const a = step.action;
  return (
    <aside className="guide" role="note">
      <button className="close" onClick={dismiss} aria-label="Hide this tip">×</button>
      <div className="guide-title">{step.title}</div>
      <p>{step.text}</p>
      {a &&
        (a.href ? (
          <a className="btn primary small" href={a.href} target="_blank" rel="noreferrer">{a.label}</a>
        ) : (
          <button
            className="btn primary small"
            onClick={() => {
              if (a.connect) connectWallet();
              if (a.tab) onTab(a.tab);
            }}
          >
            {a.label}
          </button>
        ))}
    </aside>
  );
}
