import { API_URL } from './config'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type FetchOpts = {
  method?: string
  body?: unknown
  token?: string | null
}

/**
 * Called when any request comes back 401 — the stored JWT expired (7-day TTL)
 * or was revoked server-side. The AuthProvider registers this to drop the
 * session and bounce to /login. Without it, an expired token left every screen
 * showing "Couldn't load…" with a Retry that could never succeed, and the only
 * escape was finding the "Sign out" link by luck.
 */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

/**
 * Thin fetch wrapper for the Socra REST API. Injects the JWT as a Bearer token
 * (the backend's requireAuth accepts either the web cookie or this header).
 */
export async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Network error — check your connection.')
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // An expired/rejected session is not a per-screen error — clear it and send
    // the user to sign in again, so no screen is left with a dead Retry.
    if (res.status === 401) onUnauthorized?.()
    throw new ApiError(res.status, (data as { error?: string }).error || `Request failed (${res.status})`)
  }
  return data as T
}
