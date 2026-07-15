# Socra Parent (mobile)

Expo / React Native app for **parents** to follow their children's math progress.
It reuses the existing Socra REST API via Bearer-token auth — nothing here is
part of the Next.js web build (the root `tsconfig`/eslint exclude this folder).

## Stack
- Expo SDK 52 + expo-router (file-based routing)
- expo-secure-store (JWT storage)
- @tanstack/react-query (data fetching/caching)

## Prerequisites
- Node 18+
- The **Expo Go** app on your phone (iOS App Store / Google Play), or an
  iOS Simulator / Android Emulator.

## Setup
```bash
cd mobile
npm install
# If any native package versions mismatch your installed Expo SDK, run:
npx expo install --fix
```

## Configure the API
Defaults to production (`https://www.socratutoring.com`, set in `app.json` →
`extra.apiUrl`). To point at a local Next.js dev server, set an env var before
starting (use your machine's LAN IP, not `localhost`, so a phone can reach it):

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.50:3000 npx expo start
```

## Run
```bash
npx expo start
```
Then scan the QR code with Expo Go (or press `i` / `a` for a simulator).

## Sign in
Log in with a **parent** account. Tutor/student accounts are rejected with a
message — this app is parents-only. Create a parent account on the web by
redeeming a tutor's invite link.

## Screens
- `app/login.tsx` — email/password login (`POST /api/auth/token`).
- `app/(app)/children.tsx` — linked children with a mastery summary
  (`GET /api/parent/children`).
- `app/(app)/child/[id].tsx` — topic mastery + recent session summaries
  (`GET /api/parent/children/[id]/progress` and `/sessions`).

## Publishing (EAS)

Binaries are built in Expo's cloud (no Mac required) and submitted to the
stores. One-time accounts: Apple Developer ($99/yr) and Google Play ($25 once).

```bash
npm install -g eas-cli
eas login
eas init            # links the project + writes extra.eas.projectId to app.json
eas build --platform all          # cloud-builds iOS .ipa + Android .aab
eas submit --platform ios         # uploads to App Store Connect
eas submit --platform android      # uploads to Play Console
```

Before `eas submit`:
- Fill in the `submit.production.ios` fields in `eas.json` (Apple ID, App Store
  Connect app id, Apple team id).
- For Android automated submit, drop a Google **service-account key** at
  `mobile/play-service-account.json` (gitignored). Or upload the `.aab` to the
  Play Console manually the first time.

Over-the-air JS updates (no store review) once shipped:
```bash
eas update --branch production
```

### Assets
`assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash-icon.png`, and
`assets/favicon.png` are **brand-colored placeholders** (orange + white).
Replace them with real artwork before submitting — keep the same filenames/sizes
(icon 1024×1024, adaptive foreground 1024×1024, favicon 48×48).

## Notes
- Native fetch is not subject to browser CORS, so the app talks to the API
  directly. (Expo **web** would need CORS headers — native is the target.)
- Next up (phase 5): push notifications via `expo-notifications` + a
  `ParentDevice` token registered on the backend.
