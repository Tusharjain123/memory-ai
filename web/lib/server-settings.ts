import { env } from "cloudflare:workers";
import { waitlistConfigured } from "./waitlist";

const DEFAULT_DECK = "/deck/Memory_AI_Product_Overview.pdf";
type SiteEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  DECK_URL?: string;
};
export function serverSettings() {
  const bindings = env as unknown as SiteEnvironment;
  return {
    supabaseUrl: bindings.SUPABASE_URL,
    supabaseSecretKey: bindings.SUPABASE_SECRET_KEY,
  };
}
export function publicSiteSettings() {
  const bindings = env as unknown as SiteEnvironment;
  const value = bindings.DECK_URL?.trim();
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
