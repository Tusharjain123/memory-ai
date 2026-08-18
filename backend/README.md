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
