# Memory AI website

A standalone product website in `web/`, built with React, TypeScript and Vite. It does not change the mobile app or processing backend. This delivery is local only; nothing has been deployed.

## Run locally

Requires Node.js 22.13+ and npm.

```sh
cd web
npm ci
npm run dev
```

Open the localhost URL printed by the server (normally `http://localhost:5173`). The deck and all fonts/images are served locally. Without Supabase settings, the email form is visibly unavailable and cannot pretend to save a signup.

## Connect Supabase

1. In your Supabase project's SQL Editor, run `supabase/waitlist.sql`. This creates a separate `public.waitlist_signups` table with a unique normalized email, UUID and timestamp. Row-level security is enabled, with no anonymous/authenticated read or write policies.
2. Copy `.env.example` to **`.env`** inside `web/`. The same names work as DigitalOcean runtime variables. Do not use a `NEXT_PUBLIC_`/`VITE_` prefix.
3. Set `SUPABASE_URL` to your project's HTTPS URL and `SUPABASE_SECRET_KEY` to a server secret key (`sb_secret_…`). Get these from your Supabase project settings. Follow [Supabase's API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).
4. Restart `npm run dev`. The email form becomes available when both settings are present. Submit a test address you control, then confirm one row appears in the Supabase Table Editor. Re-submit the same address with different capitalization to verify it still has one row.

The secret stays on the server and must never use a `NEXT_PUBLIC_`/`VITE_` prefix or be committed. `.env` is ignored by Git. For hosting, add the same two names as runtime secrets. A URL alone cannot enable storage.

Use Supabase's Table Editor to view or export signups. Outreach is manual. The website does not send email, create visitor accounts, or expose a list of addresses.

### Signup behavior

`POST /api/waitlist` accepts JSON with `email` and optional `company` (a hidden spam trap). It trims/lowercases email, validates input, limits the request size, inserts through Supabase REST with duplicate-ignore semantics, and returns the same success for a new or existing address. A filled spam trap returns a neutral response without storing anything. Missing configuration or provider/network errors produce a recoverable error. The client preserves the address for retry and prevents concurrent submissions.

The form also offers a feature-detected `join_early_access` WebMCP tool using the same submission flow. Browser support is optional. No analytics or third-party tracking scripts are included.

## Replace the deck link

All deck links use **one setting: `DECK_URL`** in `.env` or the host environment. Set it to your public HTTPS PDF URL, then restart the server. If left blank, it uses `/deck/Memory_AI_Product_Overview.pdf`, a copy of the completed refresh deck. You can also replace that bundled file while keeping its name. Root-relative paths or HTTPS URLs are supported.

## Edit the website

Styling is **Tailwind utility classes only**, written in the components. There are no hand-written component classes.

- `components/landing.tsx`: home page sections and copy: hero, how it works, insights, demo video, privacy, FAQ and closing.
- `components/flow-film.tsx`: the animated online + offline → memory → insights illustration under the hero.
- `components/site-chrome.tsx`: shared header (nav, theme toggle, mobile menu) and footer, used on the home page and the blog.
- `components/theme-toggle.tsx`: the light/dark switch.
- `components/waitlist-form.tsx`: accessible pill-shaped signup form and its states.
- `app/blog/`, `lib/blog.ts`: blog list, post pages and post content. To add a post, append to `posts` in `lib/blog.ts` and put its images in `public/blog/<slug>/`.
- `lib/ui.ts`: shared Tailwind class strings (buttons, eyebrow, titles, reveal). `lib/use-reveal.ts`: scroll-reveal hook.
- `app/globals.css`: fonts, colour tokens for both themes, their mapping to Tailwind names (`bg-surface`, `text-ink`, `text-accent-ink`, …), base element rules and the flow-film keyframes.
- `lib/waitlist.ts`: validation, duplicate handling and server-side storage.
- `lib/server-settings.ts`: private environment settings and public deck configuration.
- `public/`: optimized real app screenshots, artwork, self-hosted fonts and PDF.
- `ASSETS.md`: source assets and licensing.

### Colour, theme and motion

The light palette mirrors the app's own tokens in `mobile-app/src/theme.ts`; `[data-theme="dark"]` in `globals.css` overrides the same variables for dark mode, so every utility switches automatically (`dark:` is available for one-offs). `--accent` (`#16af99`) is only ever a fill; text uses `--accent-ink`. An inline script in `app/layout.tsx` sets `<html data-theme>` before first paint from the saved choice (`localStorage.theme`) or the OS preference.

All motion is disabled by one `prefers-reduced-motion` block at the end of `globals.css`. Animated elements declare their **finished** state as their resting style, so with motion off the flow film shows its final frame. Scroll reveals mark elements `data-reveal="pending"` only after JavaScript runs, so nothing is hidden without it. The flow film has a pause button and stops while off screen.

Tailwind only generates classes it finds written out in the source, so never build class names from strings at runtime (for example `` `[animation:${name}…]` ``). Spell them out, as `beat` in `flow-film.tsx` does.

Current MVP means implemented in the repository, not public release or production readiness. Roadmap cards deliberately say **Planned**. Screenshots use fictional demo data, and the two hand-built interface illustrations are labelled **Illustration** and drawn with a dashed edge so they are never mistaken for app captures. Permanent memories are local to the app; AI uses cloud processing. The current app has no built-in cloud backup/device sync, and biometric access does not encrypt its database.

## Verify

```sh
npm run typecheck
npm test
npm run build
```

`npm test` uses controlled storage responses; it never connects to Supabase. It covers normalization, duplicate success, malformed/oversized input, spam traps, absent configuration, provider failures and retry. Real database persistence can only be checked after credentials are supplied.

`npm run start` serves the production build through Wrangler on `0.0.0.0` and `PORT` (defaults to 8080). Run `npm run build` first. DigitalOcean health checks expect that port.
