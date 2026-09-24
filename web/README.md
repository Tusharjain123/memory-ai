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
2. Copy `.env.example` to **`.dev.vars`** inside `web/`. The local Cloudflare-backed server loads this file; a plain `.env` file is not sufficient for its runtime bindings.
3. Set `SUPABASE_URL` to your project's HTTPS URL and `SUPABASE_SECRET_KEY` to a server secret key (`sb_secret_…`). Get these from your Supabase project settings. Follow [Supabase's API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).
4. Restart `npm run dev`. The email form becomes available when both settings are present. Submit a test address you control, then confirm one row appears in the Supabase Table Editor. Re-submit the same address with different capitalization to verify it still has one row.

The secret stays in server runtime bindings and must never use a `NEXT_PUBLIC_`/`VITE_` prefix or be committed. `.dev.vars` is ignored by Git. For any future hosting environment, add the two values as server secrets there. A URL alone cannot enable storage.

Use Supabase's Table Editor to view or export signups. Outreach is manual. The website does not send email, create visitor accounts, or expose a list of addresses.

### Signup behavior

`POST /api/waitlist` accepts JSON with `email` and optional `company` (a hidden spam trap). It trims/lowercases email, validates input, limits the request size, inserts through Supabase REST with duplicate-ignore semantics, and returns the same success for a new or existing address. A filled spam trap returns a neutral response without storing anything. Missing configuration or provider/network errors produce a recoverable error. The client preserves the address for retry and prevents concurrent submissions.

The form also offers a feature-detected `join_early_access` WebMCP tool using the same submission flow. Browser support is optional. No analytics or third-party tracking scripts are included.

## Replace the deck link

All deck links use **one setting: `DECK_URL`** in `.dev.vars`. Set it to your public HTTPS PDF URL, then restart the server. If left blank, it uses `/deck/Memory_AI_Product_Overview.pdf`, a copy of the completed refresh deck. You can also replace that bundled file while keeping its name. Root-relative paths or HTTPS URLs are supported.

## Edit the website

- `components/landing.tsx`: sections, feature copy, walkthrough and roadmap.
- `components/app-ui/`: the hand-built illustrations (hero answer card, review card, audio meter) and the phone frame used for real screenshots.
- `components/waitlist-form.tsx`: accessible signup UI and its states.
- `app/globals.css`: design tokens, Instrument Serif + Inter typography, mint/ink/teal palette, responsive layouts and the reduced-motion kill switch.
- `app/visuals.css`: everything added in the interactive refresh — the illustrations, hover states, staggered reveals and the privacy flow animation. Loaded after `globals.css` from `app/layout.tsx`.
- `lib/waitlist.ts`: validation, duplicate handling and server-side storage.
- `lib/server-settings.ts`: private environment settings and public deck configuration.
- `public/`: optimized real app screenshots, artwork, self-hosted fonts and PDF.
- `ASSETS.md`: source assets and licensing.

### Colour and motion

The palette mirrors the app's own tokens in `mobile-app/src/theme.ts`. Two deliberate exceptions: `--accent` (`#16af99`, the app's accent) is only ever a fill, and `--muted` stays web-tuned, because the app's values fall below 4.5:1 on this background. Text and focus rings use `--accent-ink` and `--muted`. There is no dark mode.

All motion is gated by one `prefers-reduced-motion` block at the end of `globals.css`, which sets `animation: none !important` on everything. Because that freezes an animation at its *first* keyframe, every once-only effect declares its **finished** state as its resting CSS; the reveal observer adds `.will-reveal` to rewind it and `.is-visible` to play it forward, and it never adds `.will-reveal` under reduced motion. `.will-reveal` is never removed, so any `.is-visible` rule must restate the finished values, not just supply a transition.

Current MVP means implemented in the repository, not public release or production readiness. Roadmap cards deliberately say **Planned**. Screenshots use fictional demo data, and the two hand-built interface illustrations are labelled **Illustration** and drawn with a dashed edge so they are never mistaken for app captures. Permanent memories are local to the app; AI uses cloud processing. The current app has no built-in cloud backup/device sync, and biometric access does not encrypt its database.

## Verify

```sh
npm run typecheck
npm test
npm run build
```

`npm test` uses controlled storage responses; it never connects to Supabase. It covers normalization, duplicate success, malformed/oversized input, spam traps, absent configuration, provider failures and retry. Real database persistence can only be checked after credentials are supplied.

`npm run start` serves the production build locally through Wrangler. This command is not a deployment. The development preview remains the simplest way to review changes.
