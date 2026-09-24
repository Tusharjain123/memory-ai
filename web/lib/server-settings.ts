import { env } from "cloudflare:workers";
import { waitlistConfigured } from "./waitlist";

const DEFAULT_DECK = "/deck/Memory_AI_Product_Overview.pdf";
type SiteEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  DECK_URL?: string;
};

function readBinding(name: keyof SiteEnvironment): string | undefined {
  const bindings = env as unknown as SiteEnvironment;
  const fromWorker = bindings[name];
  if (typeof fromWorker === "string" && fromWorker.trim()) return fromWorker;
  try {
    const fromProcess = process.env[name];
    if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess;
  } catch {
    /* Worker isolate may not expose process.env. */
  }
  return undefined;
}

export function serverSettings() {
  return {
    supabaseUrl: readBinding("SUPABASE_URL"),
    supabaseSecretKey: readBinding("SUPABASE_SECRET_KEY"),
  };
}

export function publicSiteSettings() {
  const value = readBinding("DECK_URL")?.trim();
  let deckUrl = DEFAULT_DECK;
  if (
    value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  )
    deckUrl = value;
  else if (value) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:") deckUrl = url.href;
    } catch {
      /* Use bundled deck. */
    }
  }
  return { deckUrl, signupAvailable: waitlistConfigured(serverSettings()) };
}
