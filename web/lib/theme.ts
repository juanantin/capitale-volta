// Light ("clear") / dark theme, like volta.family. Remembered per device; light by default.

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const KEY = "capitale.theme";
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const t = window.localStorage.getItem(KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* storage blocked */
  }
  return "light";
}

let current: Theme = typeof window === "undefined" ? "light" : read();

function apply(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#ffb48a" : "#0c0a1f");
}

if (typeof window !== "undefined") apply(current);

export function getTheme(): Theme {
  return current;
}

export function setTheme(t: Theme) {
  if (t === current) return;
  current = t;
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    /* storage blocked: theme still applies for this visit */
  }
  apply(t);
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getTheme,
    () => "light" as Theme,
  );
}

/** Pick a colour for the current theme (light mode uses the darker ink for contrast). */
export function themed(dark: string, light: string, theme: Theme = current) {
  return theme === "light" ? light : dark;
}

/** The ink for a city or token in the current theme (cities: `dark`, tokens: `colourLight`). */
export function ink(x: { colour: string; dark?: string; colourLight?: string }): string {
  return current === "light" ? (x.colourLight ?? x.dark ?? x.colour) : x.colour;
}
