import type { Metadata, Viewport } from "next";
import "./globals.css";
import { tagline } from "@/lib/site-copy";

export const metadata: Metadata = {
  title: `Memory AI — ${tagline.summary}`,
  description:
    "Memory AI connects your online meetings and in-person conversations into one memory, then turns them into promises, decisions and a brief before you meet. No meeting bot. Join early access.",
  icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1faf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1220" },
  ],
};

/* Runs before first paint so the page never flashes the wrong theme:
   the saved choice wins, otherwise the OS preference. */
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
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
