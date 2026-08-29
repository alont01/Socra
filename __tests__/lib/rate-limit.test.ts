import { rateLimit, trackedKeyCount } from '@/lib/rate-limit'

describe('rateLimit', () => {
  it('allows requests under the limit', () => {
    const key = `test-allow-${Date.now()}`
    const result = rateLimit(key, { maxRequests: 5, windowMs: 10_000 })
    expect(result.limited).toBe(false)
  })

  it('allows exactly maxRequests', () => {
    const key = `test-exact-${Date.now()}`
    for (let i = 0; i < 5; i++) {
      const result = rateLimit(key, { maxRequests: 5, windowMs: 10_000 })
      expect(result.limited).toBe(false)
    }
  })

  it('blocks requests over the limit', () => {
    const key = `test-block-${Date.now()}`
    for (let i = 0; i < 3; i++) {
      rateLimit(key, { maxRequests: 3, windowMs: 10_000 })
    }
    const result = rateLimit(key, { maxRequests: 3, windowMs: 10_000 })
    expect(result.limited).toBe(true)
  })

  it('returns 429 status when rate limited', () => {
    const key = `test-429-${Date.now()}`
    rateLimit(key, { maxRequests: 1, windowMs: 10_000 })
    const result = rateLimit(key, { maxRequests: 1, windowMs: 10_000 })
    expect(result.limited).toBe(true)
    expect(result.status).toBe(429)
    expect(result.message).toBeTruthy()
  })

  it('uses separate counters for different keys', () => {
    const key1 = `test-sep1-${Date.now()}`
    const key2 = `test-sep2-${Date.now()}`
    rateLimit(key1, { maxRequests: 1, windowMs: 10_000 })
    rateLimit(key1, { maxRequests: 1, windowMs: 10_000 }) // blocked

    const result = rateLimit(key2, { maxRequests: 1, windowMs: 10_000 })
    expect(result.limited).toBe(false) // different key, should be allowed
  })
})

describe('store growth', () => {
  it('stays bounded when flooded with distinct keys inside one window', () => {
    // Keys are attacker-chosen (most limits are keyed by client IP), so a spray
    // from many addresses mints an entry per request. Sweeping only *expired*
    // entries does nothing inside a single window — the map grew without bound
    // and the limiter became the way to exhaust the process's memory.
    for (let i = 0; i < 120_000; i++) {
      rateLimit(`flood:${i}`, { maxRequests: 5, windowMs: 60_000 })
    }
    expect(trackedKeyCount()).toBeLessThanOrEqual(100_000)
  })

  it('still limits a key that is actively hammering after a flood', () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('victim', { maxRequests: 5, windowMs: 60_000 }).limited).toBe(false)
    }
    expect(rateLimit('victim', { maxRequests: 5, windowMs: 60_000 }).limited).toBe(true)
  })
})
