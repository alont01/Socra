// Resolving the caller's IP from `X-Forwarded-For`.
//
// XFF is a client-supplied header that proxies append to. Reading the FIRST
// entry — the conventional "that's the client" choice, and what this app used
// to do everywhere — reads whatever the caller put there. A request sent with
// `X-Forwarded-For: <random>` therefore landed in a fresh rate-limit bucket
// every time, which quietly defeated the per-IP limits on login, signup,
// password reset, and the public consultation form.
//
// The only entries that can be trusted are the ones our own infrastructure
// appended. With a single trusted proxy in front of the app (Render's load
// balancer), the LAST entry is the peer address it observed, and it is the
// only one a client cannot forge: anything the caller supplies is pushed left
// of it.
//
// If another trusted proxy is ever put in front (a CDN, say), set
// TRUSTED_PROXY_HOPS to the number of proxies that append to XFF, so the hop
// they added is skipped too. Setting it too HIGH reads a client-controlled
// value again, so it must match the real topology.

const DEFAULT_TRUSTED_HOPS = 1

function trustedHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS)
  return Number.isInteger(raw) && raw >= 1 ? raw : DEFAULT_TRUSTED_HOPS
}

/**
 * The client IP as observed by our own proxy, or null when there is no usable
 * forwarding header (a direct request, or local development).
 */
export function clientIp(request: Request): string | null {
  const header = request.headers.get('x-forwarded-for')
  if (!header) return null

  const hops = header
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean)
  if (hops.length === 0) return null

  // Count back from the right by the number of proxies that appended a hop.
  // Clamped at 0 so a misconfigured hop count degrades to the leftmost entry
  // rather than reading past the start of the chain.
  const index = Math.max(0, hops.length - trustedHops())
  return hops[index] ?? null
}

/**
 * The client IP for use as a rate-limit bucket key.
 *
 * Falls back to a single shared `unknown` bucket rather than something
 * caller-derived: an unidentifiable caller sharing one stricter bucket with
 * every other unidentifiable caller is the safe failure mode, where a
 * caller-supplied fallback would hand out a private bucket on request.
 */
export function rateLimitKeyForIp(request: Request): string {
  return clientIp(request) ?? 'unknown'
}
