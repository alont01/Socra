interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

/**
 * Hard ceiling on tracked keys.
 *
 * Keys are attacker-chosen: most limits are keyed by client IP, so a spray from
 * many addresses mints a new entry per request. Sweeping only expired entries
 * every 60s does nothing about that — within a single window the map grows
 * without bound, and the endpoint meant to protect the process becomes the way
 * to exhaust its memory. 100k entries is far more than any real traffic mix and
 * costs a few MB.
 */
const MAX_ENTRIES = 100_000

/** Tracked-key count. Exported so the growth bound can be asserted in tests. */
export function trackedKeyCount(): number {
  return store.size
}

/** Drop everything already expired. Returns how many remain. */
function sweep(now: number): number {
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key)
  }
  return store.size
}

// Clean up expired entries periodically
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => sweep(Date.now()), 60_000)
  // Don't hold the process open on this alone (matters for scripts and tests).
  timer.unref?.()
}

/**
 * Make room for a new key once the map is full.
 *
 * Sweeps expired entries first; if the map is still full, every live entry is
 * at its limit-tracking peak and something abnormal is happening. Evicting the
 * oldest-expiring entries is the least-bad option: it briefly forgives the keys
 * closest to resetting anyway, and never grows past the cap.
 */
function evictIfFull(now: number): void {
  if (store.size < MAX_ENTRIES) return
  if (sweep(now) < MAX_ENTRIES) return

  const byExpiry = [...store.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
  for (const [key] of byExpiry.slice(0, Math.ceil(MAX_ENTRIES / 10))) {
    store.delete(key)
  }
}

interface RateLimitResult {
  limited: boolean
  status: number
  message: string
}

/**
 * Simple in-memory rate limiter.
 * Returns { limited: false } if allowed, or { limited: true, status: 429, message } if blocked.
 *
 * Counters live in this process only. With more than one instance behind the
 * load balancer the effective limit is (configured limit × instances), and a
 * deploy or restart resets every counter — so treat these as a brake on casual
 * abuse and accidental retry storms, not as a security control. Enforcing a
 * real limit across instances needs shared state (Redis or equivalent), which
 * this stack does not currently have.
 */
export function rateLimit(
  key: string,
  { maxRequests = 10, windowMs = 60_000 }: { maxRequests?: number; windowMs?: number } = {},
): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    evictIfFull(now)
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { limited: false, status: 200, message: '' }
  }

  entry.count++
  if (entry.count > maxRequests) {
    return { limited: true, status: 429, message: 'Too many requests. Please try again later.' }
  }

  return { limited: false, status: 200, message: '' }
}
