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

Audio is written only to a random temporary directory while its job runs. Provider calls have bounded timeouts, and the worker removes the directory in a `finally` block. This backend never stores permanent conversation or transcript records.

`src/contracts.ts` defines the backend side of the HTTP contract. When the API shape changes, update the corresponding mobile contract intentionally.
