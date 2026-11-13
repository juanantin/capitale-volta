import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Capitale",
    short_name: "Capitale",
    description: "Build a palazzo in Italy and earn VOLTA, SENT and VOID. On Volta · Elysium.",
    start_url: "/",
    display: "standalone",
    background_color: "#edf5f2",
    theme_color: "#0b2a21",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
