# Local Development Setup

## Prerequisites

- Node.js 20+
- Java 17 (Android builds)
- Android Studio (Hedgehog+) with Pixel 6 API 34 AVD, fingerprint enrolled
- Firebase CLI: `npm install -g firebase-tools`

## 1. Install dependencies

```bash
cd types && npm install && npm run build && cd ..
cd functions && npm install && cd ..
cd web && npm install && cd ..
```

Types must be built before functions (`functions/tsconfig.json` resolves `@medguard/types` from `types/dist/`).

## 2. Configure environment

Copy `.env.example` to `.env` in `web/` and `functions/`. Fill in Firebase config values from the Firebase console.

Place `google-services.json` in `android/app/` (download from Firebase console).

## 3. Start emulators

```bash
set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
set FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
set USE_EMULATORS=true
set GCLOUD_PROJECT=medguard-dev
firebase emulators:start
```

Wait for "All emulators ready." Emulator UI at http://localhost:4000.

| Emulator | Port |
|---|---|
| Auth | 9099 |
| Firestore | 8080 |
| Functions | 5001 |
| Storage | 9199 |
| Hosting | 5000 |

## 4. Run web dashboard

```bash
cd web && npm run dev
```

Opens at http://localhost:5173. Connects to emulators automatically when `VITE_USE_EMULATORS=true`.

## 5. Run Android

Open `android/` in Android Studio. Debug variant connects to emulators. Run on the Pixel 6 API 34 AVD.

## 6. Run tests

```bash
# Functions unit tests
cd functions && npm test

# Functions integration tests (emulators must be running)
cd functions && npm run test:integration

# Web unit tests
cd web && npx vitest run

# Web E2E tests (emulators + dev server must be running)
cd web && npx playwright test

# Android unit tests
cd android && ./gradlew test
```

## Notes

- `expireShareCodes` requires the pubsub emulator, which is not included in the standard emulator config. It is covered by unit tests only.
- Rebuild types after any change to `types/src/`: `cd types && npm run build`
- The Firestore emulator hot-reloads `firestore.rules` on save.
- Cloud Functions emulator hot-reloads on recompile. Run `npm run build:watch` in `functions/` for continuous rebuilds.