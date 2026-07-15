import Constants from 'expo-constants'

// API base URL. Override per-environment with EXPO_PUBLIC_API_URL (e.g. point at
// a local Next.js dev server from a simulator). Falls back to app.json extra,
// then production.
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  'https://www.socratutoring.com'
