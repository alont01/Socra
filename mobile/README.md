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

## Notes
- Native fetch is not subject to browser CORS, so the app talks to the API
  directly. (Expo **web** would need CORS headers — native is the target.)
- Next up (phase 5): push notifications via `expo-notifications` + a
  `ParentDevice` token registered on the backend.
