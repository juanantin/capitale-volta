"use client";

import { setTheme, useTheme } from "../lib/theme";

/** Square light/dark switch in Volta's style: a line-drawn sun or moon plus a mono label. */
export default function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button className="theme-toggle" onClick={() => setTheme(next)} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
        </svg>
      )}
      <span>{next === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
