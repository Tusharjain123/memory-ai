# Memory AI

Privacy-first conversation memory for Android. The repository contains two independent projects; each owns its dependencies, configuration, contracts, documentation, and operational files.

## Projects

| Directory | Purpose | Install location |
| --- | --- | --- |
| [`mobile-app/`](mobile-app/) | Expo/React Native application and on-device SQLite data | `mobile-app/` |
| [`backend/`](backend/) | NestJS transient processing API with Redis and Ollama Cloud integration | `backend/` |

There is no root JavaScript workspace and no root `node_modules`. Install and run each project inside its own directory.

## Start locally

Backend:

```bash
cd backend
pnpm install
cp .env.example .env
docker compose up -d redis
pnpm dev
```

Mobile app, in a second terminal:

```bash
cd mobile-app
pnpm install
cp .env.example .env
pnpm dev
```

For the Android emulator, configure `mobile-app/.env` with:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
```

See [backend setup](backend/README.md) and [mobile setup](mobile-app/README.md).

## Runtime boundary

The mobile app owns permanent data. The backend temporarily processes audio, transcribes it, uses configured Ollama models, returns the result, and removes temporary audio. The backend has no permanent conversation database.
