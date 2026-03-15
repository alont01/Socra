interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key)
    }
  }, 60_000)
}

interface RateLimitResult {
  limited: boolean
  status: number
  message: string
}

/**
 * Simple in-memory rate limiter.
 * Returns { limited: false } if allowed, or { limited: true, status: 429, message } if blocked.
 */
export function rateLimit(
  key: string,
  { maxRequests = 10, windowMs = 60_000 }: { maxRequests?: number; windowMs?: number } = {},
): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { limited: false, status: 200, message: '' }
  }

  entry.count++
  if (entry.count > maxRequests) {
    return { limited: true, status: 429, message: 'Too many requests. Please try again later.' }
  }

  return { limited: false, status: 200, message: '' }
}
