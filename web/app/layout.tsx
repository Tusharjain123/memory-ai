import type { Metadata, Viewport } from "next";
/* Order matters: visuals.css refines rules declared in globals.css, so it has
   to load after it. It cannot be an @import inside globals.css, because CSS
   requires @import to precede every other rule — it would land first. */
import "./globals.css";
import "./visuals.css";

export const metadata: Metadata = {
  title: "Memory AI — Never forget what you promised a client",
  description:
    "Memory AI remembers what was promised, decided and asked in your one-to-one client conversations. No meeting bot, and memories stay on your phone. Join early access.",
  icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
};

export const viewport: Viewport = {
  themeColor: "#f1faf7",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Self-hosted, same-origin. crossOrigin is required even here — without
            it the preload is discarded and the font is fetched twice. */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/inter-latin-wght-normal.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/instrument-serif-latin-400-normal.woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
