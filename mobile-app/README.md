# Memory AI Mobile App

Independent Android-first Expo/React Native application. This directory owns its dependencies, UI assets, UX documentation, local SQLite database, and mobile API contracts.

## Install and run

```bash
cd mobile-app
pnpm install
cp .env.example .env
pnpm dev
```

For an Android emulator talking to a backend on the development computer:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
```

Then press `a` in Expo, or run:

```bash
pnpm android
```

## Commands

```bash
pnpm dev
pnpm android
pnpm ios
pnpm build:preview
pnpm build:production
pnpm typecheck
pnpm test
```

## Android preview build (EAS)

```bash
cd mobile-app
pnpm install
pnpx eas-cli login
pnpx eas-cli init
pnpm build:preview
```

Download the APK from the Expo build page and install it on a device. Preview/production profiles set `EXPO_PUBLIC_API_URL` in `eas.json`.

Permanent conversation data remains in local SQLite. `src/contracts.ts` defines the mobile side of the backend HTTP contract. When the API shape changes, update both project copies intentionally.

The product UX specification is in [`docs/UX_DESIGN.md`](docs/UX_DESIGN.md).
