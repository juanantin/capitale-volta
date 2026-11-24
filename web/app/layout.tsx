import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GAME } from "../lib/config";

export const metadata: Metadata = {
  title: GAME.name,
  description: "Build a palazzo in Milano, Roma, Napoli, Venezia or Palermo and earn Montra's top tokens: MONTRA, LiquidV, EACCAT, CHAMELEON and NUM. A city-building game on Elysium, launched on Montra.",
  twitter: { card: "summary", ...(GAME.xHandle ? { site: GAME.xHandle } : {}) },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#050505",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme (dark by default) before anything paints. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('capitale.theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
