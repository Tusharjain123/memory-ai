# Memory AI Backend

Independent NestJS/Fastify/BullMQ processing API. This directory owns its dependencies, Redis development stack, backend contracts, and tests. Chat and embeddings use Ollama Cloud.

## Install and run

```bash
cd backend
pnpm install
cp .env.example .env
docker compose up -d redis
pnpm dev
```

The API defaults to `http://localhost:3000`.

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
```

Provider readiness:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
curl http://localhost:3000/health/providers
```

## Privacy boundary

Audio is written only to a random temporary directory while its job runs. Provider calls have bounded timeouts, and the worker removes the directory in a `finally` block. Redis stores only queue metadata and a tiny `{ stored: true }` pointer. The full `ProcessedConversation` is a short-lived row in Supabase (`supabase/processing_results.sql`) until `/process/status` delivers it to the phone; this backend still does not keep permanent conversation records.

Processing handoff uses the same `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as in-app feedback. Apply `supabase/app_feedback.sql` and `supabase/processing_results.sql` in the Supabase SQL editor once.

`src/contracts.ts` defines the backend side of the HTTP contract. When the API shape changes, update the corresponding mobile contract intentionally.

## Optional cloud account (Connect Google), folders and credits

The app never requires an account. Connecting Google creates a cloud account; storing data in the cloud is a separate switch (`users.cloud_sync_enabled`, off by default).

Apply in the Supabase SQL editor, in this order (each file is safe to re-run):

1. `supabase/users.sql` — `users` (name, age, gender, email, phone_number, metadata, cloud_sync_enabled). Clients can update only their own profile columns and the sync flag.
2. `supabase/wallet.sql` — `user_balance`, `credit_transactions`, the service-role-only `apply_credit_transaction()` RPC, and the `auth.users` trigger that creates the `users` row and a 0-credit balance on first sign-in.
3. `supabase/folders.sql` — `folders` and `folder_recordings` (local conversation ids). RLS allows writes only while the caller's `cloud_sync_enabled` is true; delete is always allowed.

Dashboard and console setup:

- Google Cloud console → OAuth client IDs: **Web** (used by Supabase and the app's `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`), **Android** (package `ai.memory.mobile` + SHA-1 from `eas credentials`), **iOS** (bundle `ai.memory.mobile`).
- Supabase → Authentication → Providers → Google: enable with the Web client ID/secret and add the Android and iOS client IDs to "Authorized Client IDs".
- For iOS, add `{ "iosUrlScheme": "com.googleusercontent.apps.<ios-client-id>" }` to the `@react-native-google-signin/google-signin` plugin in `mobile-app/app.json`.
- The Google sign-in module is native: build a new EAS dev/preview build (it does not run in Expo Go).

Backend routes needing a Supabase access token (`Authorization: Bearer …`): `GET /v1/me/balance`, `GET /v1/me/transactions`, `DELETE /v1/me/cloud-data`. All other routes stay anonymous. Tokens are verified against `$SUPABASE_URL/auth/v1/.well-known/jwks.json`; set `SUPABASE_JWT_SECRET` only if the project still uses the legacy HS256 secret.

## Google Calendar + Meet import (optional)

Signed-in users can connect read-only Calendar and Meet access, see their Google Meet calls, and import Meet transcripts as memories. Transcripts are processed like audio: they pass through the queue and the 4-hour result hand-off, then are saved only on the device.

Setup:

1. Apply `supabase/google.sql` after `folders.sql`. It creates `google_connections`, which holds the encrypted refresh token. Only the service role can access it.
2. In the Google Cloud project that has the OAuth clients:
   - Enable the **Google Calendar API** and the **Google Meet REST API**.
   - On the OAuth consent screen, add the scopes `calendar.events.readonly` and `meetings.space.readonly`.
   - Add test users. While the app is in *Testing* mode, refresh tokens expire after 7 days and the app will ask to reconnect. Publishing requires Google's verification for these sensitive scopes.
3. Backend `.env`:
   - `GOOGLE_CLIENT_ID`: the **Web** OAuth client, the same value as the app's `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
   - `GOOGLE_CLIENT_SECRET`.
   - `GOOGLE_TOKEN_ENCRYPTION_KEY`: 32 random bytes in base64. Changing it later forces everyone to reconnect.

Routes (Supabase access token required):

- `POST /v1/me/google/connect` with `{ serverAuthCode }`
- `GET /v1/me/google/status`
- `DELETE /v1/me/google` (revokes access at Google)
- `GET /v1/me/google/meetings?from&to` (defaults to the last 14 days through the next 7)
- `GET /v1/me/google/calendar/current`
- `POST /v1/me/google/meetings/:eventId/import` returns `{ jobId }`. Poll it with `POST /v1/conversations/process/status`.

Limits: Meet only saves transcripts on Google Workspace plans with transcription turned on. Conference records and transcript entries are kept for about 30 days.

## Wallet billing and top-ups (Dodo Payments)

AI work is prepaid from each account's wallet (amounts in micro-USD).

- **Sign-up credit:** new accounts get **$5.00** (`handle_new_user` in `supabase/wallet.sql`). The same file backfills existing accounts once.
- **Per conversation:**
  - Processing a recording or importing a Meet transcript first **holds** an estimate.
  - When the job finishes, the hold is settled to the **metered cost**: Deepgram seconds, LLM tokens and embedding tokens, priced by `PRICE_*`.
  - Failed jobs are refunded in full.
  - Ask Memory charges its metered cost after answering.
  - A balance too low for the estimate returns **402** `insufficient_balance`.
- **Top-ups:** fixed packs from `WALLET_PACKS`, each a Dodo one-time product. Paying $X adds ⅔·$X of credit; the 50% margin is taken at top-up.
- **Sign-in:** every processing, import and Ask route requires a signed-in account.

**Setup:**
1. Run `supabase/wallet.sql` and `supabase/payments.sql` in the Supabase SQL editor. Both are safe to re-run.
2. In the Dodo dashboard (test mode first):
   - Create one **one-time** product per pack, priced in USD, and put their IDs in `WALLET_PACKS`.
   - Add a webhook endpoint `{PUBLIC_API_URL}/v1/payments/dodo/webhook` for `payment.succeeded` and `payment.failed`, and copy its signing secret to `DODO_WEBHOOK_SECRET`.
3. Set `DODO_API_KEY`, `DODO_ENV` and `PUBLIC_API_URL` (https).
   - For local testing, expose the backend with `cloudflared tunnel --url http://localhost:3000` and use that URL.

Webhooks are verified with Standard Webhooks HMAC signatures over the raw body. Credits are idempotent per payment ID, so Dodo's retries never double-credit.
