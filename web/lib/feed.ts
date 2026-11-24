// The city's live feed. Every real city event (a buy, a new palazzo, a level
// up, an invite) becomes a post, like a phone feed in the city. Purely cosmetic.

import { useSyncExternalStore } from "react";
import { DISTRICTS, GAME, LIVE, PRELAUNCH, TICKER, TOKENS, cityToken } from "./config";
import { onCityEvent, type CityEvent } from "./store";

export interface Post {
  id: number;
  at: number;
  handle: string;
  /** City colour for the avatar ring, or null for the news account. */
  city: number | null;
  kind: "score" | "build" | "level" | "invite" | "news";
  text: string;
  /** Token colour for score posts. */
  token?: number;
}

const NEWS = GAME.news;
let posts: Post[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
let started = false;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function push(p: Omit<Post, "id" | "at">, at = Date.now()) {
  posts = [{ ...p, id: nextId++, at }, ...posts].slice(0, 40);
  listeners.forEach((l) => l());
}

export function postFromEvent(e: CityEvent): Omit<Post, "id" | "at"> | null {
  switch (e.type) {
    case "bought": {
      const cities = DISTRICTS.filter((d) => cityToken(d) === e.token);
      const lead = cities[0];
      return {
        handle: lead?.handle ?? NEWS,
        city: lead?.id ?? null,
        kind: "score",
        token: e.token,
        text: `The city bought ${fmt(e.tokens)} ${TOKENS[e.token].token} for ${cities.map((d) => d.city).join(" and ") || "its palazzi"}: ${
          e.buildings === 1 ? "all for 1 palazzo" : `shared by ${fmt(e.buildings)} palazzi`
        }.`,
      };
    }
    case "built": {
      const d = DISTRICTS[e.building.district];
      return { handle: d.handle, city: d.id, kind: "build", text: `A new palazzo in ${d.city}: #${fmt(e.building.id)} just went up.` };
    }
    case "levelUp": {
      const d = DISTRICTS[e.building.district];
      return { handle: NEWS, city: null, kind: "level", text: `Palazzo #${fmt(e.building.id)} in ${d.city} just added a floor. Now level ${e.from + 1}.` };
    }
    case "invited": {
      const d = DISTRICTS[e.building.district];
      return { handle: d.handle, city: d.id, kind: "invite", text: `#${fmt(e.building.id)} keeps bringing friends to ${d.city}. Fireworks tonight.` };
    }
    case "taxIn":
      return { handle: NEWS, city: null, kind: "news", text: `The vault just collected ${e.amount.toLocaleString("en-US", { maximumFractionDigits: 3 })} HYPE of city tax from ${TICKER} trading.` };
    case "weekClosed":
      return {
        handle: NEWS,
        city: null,
        kind: "news",
        text: `Week closed.${e.winners.length ? ` Street race: ${e.winners.map((w) => DISTRICTS[w].city).join(" & ")} won the street pool.` : " Nobody built this week."}`,
      };
    default:
      return null;
  }
}

/** Starts listening to city events (once) and seeds a few posts so the feed is never empty. */
export function startFeed() {
  if (started) return;
  started = true;
  const now = Date.now();
  // The real city only shows real events; the sample posts are for the preview.
  const realCity = !!LIVE.vault || (typeof window !== "undefined" && !!new URLSearchParams(window.location.search).get("city"));
  const seed: Omit<Post, "id" | "at">[] = realCity
    ? [{ handle: NEWS, city: null, kind: "news", text: "Capitale is open. Pick a city, build a palazzo, earn its token." }]
    : PRELAUNCH
    ? [{ handle: NEWS, city: null, kind: "news", text: `Capitale opens soon. ${TICKER} launches on Montra: 3,000 palazzi, five cities, five tokens.` }]
    : [
    { handle: NEWS, city: null, kind: "news", text: "Street race: Milano leads the week on new palazzi. Roma three behind." },
    { handle: DISTRICTS[3].handle, city: 3, kind: "score", token: 2, text: "The city bought 1,210,400 EACCAT for Venezia: shared by 224 palazzi." },
    { handle: DISTRICTS[4].handle, city: 4, kind: "news", text: "Palermo earns NUM, and Sicily has room: the plots nearest the cathedral are still free." },
    { handle: DISTRICTS[1].handle, city: 1, kind: "score", token: 0, text: "Roma earns MONTRA, Montra's own token, bought on every order." },
  ];
  seed.forEach((p, i) => push(p, now - (i + 1) * 7 * 60_000));
  onCityEvent((e) => {
    if (e.type === "history") {
      // The real city's recent history replaces the welcome post.
      if (e.events.length) {
        posts = [];
        for (const h of e.events) {
          const p = postFromEvent(h.event);
          if (p) push(p, h.at);
        }
      }
      return;
    }
    const p = postFromEvent(e);
    if (p) push(p);
  });
}

export function useFeed(): Post[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => posts,
    () => posts,
  );
}

export function ago(at: number, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
