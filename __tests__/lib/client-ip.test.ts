/**
 * @jest-environment node
 */
import { clientIp, rateLimitKeyForIp } from '@/lib/client-ip'

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://socra.test/api/auth/login', { headers })
}

describe('clientIp', () => {
  it('returns null when there is no forwarding header', () => {
    expect(clientIp(req())).toBeNull()
  })

  it('uses the single hop our proxy set', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7')
  })

  // The whole point of the helper: everything left of our proxy's hop is
  // attacker-controlled, so a spoofed prefix must not become the bucket key.
  it('ignores a client-supplied prefix and trusts the proxy-appended hop', () => {
    const spoofed = req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' })
    expect(clientIp(spoofed)).toBe('203.0.113.7')
  })

  it('gives every spoofed prefix the same bucket for a given real caller', () => {
    const a = clientIp(req({ 'x-forwarded-for': 'aaa, 203.0.113.7' }))
    const b = clientIp(req({ 'x-forwarded-for': 'bbb, 203.0.113.7' }))
    expect(a).toBe(b)
  })

  it('tolerates whitespace and empty entries', () => {
    expect(clientIp(req({ 'x-forwarded-for': ' 9.9.9.9 ,  , 203.0.113.7 ' }))).toBe('203.0.113.7')
  })

  it('returns null for a header with no usable entries', () => {
    expect(clientIp(req({ 'x-forwarded-for': ' , , ' }))).toBeNull()
  })

  describe('with an extra trusted proxy configured', () => {
    const original = process.env.TRUSTED_PROXY_HOPS
    afterEach(() => {
      if (original === undefined) delete process.env.TRUSTED_PROXY_HOPS
      else process.env.TRUSTED_PROXY_HOPS = original
    })

    it('skips the configured number of appended hops', () => {
      process.env.TRUSTED_PROXY_HOPS = '2'
      const r = req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7, 10.0.0.1' })
      expect(clientIp(r)).toBe('203.0.113.7')
    })

    it('falls back to the default for a nonsense value', () => {
      process.env.TRUSTED_PROXY_HOPS = 'not-a-number'
      expect(clientIp(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }))).toBe('203.0.113.7')
    })

    it('degrades to the leftmost hop rather than reading past the chain', () => {
      process.env.TRUSTED_PROXY_HOPS = '9'
      expect(clientIp(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }))).toBe('9.9.9.9')
    })
  })
})

describe('rateLimitKeyForIp', () => {
  it('shares one bucket across callers we cannot identify', () => {
    expect(rateLimitKeyForIp(req())).toBe('unknown')
    expect(rateLimitKeyForIp(req({ 'x-forwarded-for': '' }))).toBe('unknown')
  })

  it('keys on the trusted hop when there is one', () => {
    expect(rateLimitKeyForIp(req({ 'x-forwarded-for': 'spoof, 203.0.113.7' }))).toBe('203.0.113.7')
  })
})
