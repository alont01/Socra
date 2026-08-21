/**
 * @jest-environment node
 */
jest.mock('@/lib/stripe', () => ({ getStripe: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: jest.fn() } }))

import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { checkIntegrations, missingRequiredEnv, overallStatus, type IntegrationResult } from '@/lib/integrations'

const mockGetStripe = getStripe as jest.Mock
const p = prisma as unknown as { $queryRaw: jest.Mock }

const ENV_KEYS = [
  'ANTHROPIC_API_KEY', 'DAILY_API_KEY', 'RESEND_API_KEY',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'DATABASE_URL',
  'CRON_SECRET', 'JWT_SECRET', 'AUTH_SECRET',
] as const
const ORIGINAL: Record<string, string | undefined> = {}

// NODE_ENV is typed readonly, so it needs a widened handle to set in a test.
const env = process.env as Record<string, string | undefined>

/** Every credential present, every provider healthy. */
function healthyWorld() {
  for (const key of ENV_KEYS) process.env[key] = 'set-for-test'
  env.NODE_ENV = 'test'
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch
  mockGetStripe.mockReturnValue({ balance: { retrieve: jest.fn().mockResolvedValue({ livemode: false }) } })
  p.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
}

const byKey = (results: IntegrationResult[], key: string) => results.find((r) => r.key === key)!

beforeAll(() => {
  for (const key of ENV_KEYS) ORIGINAL[key] = process.env[key]
  ORIGINAL.NODE_ENV = process.env.NODE_ENV
})
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  healthyWorld()
})
afterEach(() => {
  jest.restoreAllMocks()
  for (const key of [...ENV_KEYS, 'NODE_ENV']) {
    if (ORIGINAL[key] === undefined) delete env[key]
    else env[key] = ORIGINAL[key]
  }
})

describe('checkIntegrations', () => {
  it('reports every integration healthy when all credentials work', async () => {
    const results = await checkIntegrations()
    expect(results.every((r) => r.status === 'ok')).toBe(true)
    expect(overallStatus(results)).toBe('ok')
  })

  it('reports not_configured for an unset credential without calling the provider', async () => {
    delete process.env.DAILY_API_KEY
    const results = await checkIntegrations()

    expect(byKey(results, 'daily').status).toBe('not_configured')
    expect(byKey(results, 'daily').detail).toContain('DAILY_API_KEY')
    // A key that isn't set can't be probed — don't waste a request finding out.
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('daily.co'))).toBe(false)
  })

  it('distinguishes a rejected key from a provider outage', async () => {
    global.fetch = jest.fn(async (url: unknown) =>
      String(url).includes('anthropic')
        ? { ok: false, status: 401 }
        : { ok: false, status: 503 },
    ) as unknown as typeof fetch

    const results = await checkIntegrations()

    // This distinction is the point: one is fixed by rotating a key, the other
    // by waiting.
    expect(byKey(results, 'anthropic').status).toBe('unauthorized')
    expect(byKey(results, 'daily').status).toBe('unreachable')
  })

  it('treats a thrown probe as unreachable rather than failing the whole check', async () => {
    p.$queryRaw.mockRejectedValue(new Error('connection refused'))

    const results = await checkIntegrations()

    expect(byKey(results, 'database').status).toBe('unreachable')
    // One broken probe must not hide the others.
    expect(byKey(results, 'anthropic').status).toBe('ok')
  })

  it('recovers an auth failure that a provider SDK threw instead of returning', async () => {
    mockGetStripe.mockReturnValue({
      balance: { retrieve: jest.fn().mockRejectedValue(new Error('Invalid API Key provided: sk_test_***')) },
    })

    expect(byKey(await checkIntegrations(), 'stripe').status).toBe('unauthorized')
  })

  it('flags a live Stripe key outside production', async () => {
    mockGetStripe.mockReturnValue({ balance: { retrieve: jest.fn().mockResolvedValue({ livemode: true }) } })

    const stripe = byKey(await checkIntegrations(), 'stripe')

    // Charging real cards from a staging deploy is the expensive mistake.
    expect(stripe.status).toBe('unauthorized')
    expect(stripe.detail).toMatch(/live mode/)
  })

  it('treats a Resend send-only restricted key as healthy, not unauthorized', async () => {
    // A key scoped to "Sending access" correctly 401s on /domains — that's the
    // desired least-privilege configuration, not a broken credential. Found
    // live: a key rejected this way was still sending real mail successfully.
    global.fetch = jest.fn(async (url: unknown) => {
      if (!String(url).includes('resend')) return { ok: true, status: 200 }
      return {
        ok: false,
        status: 401,
        clone() { return this },
        json: async () => ({ statusCode: 401, name: 'restricted_api_key', message: 'This API key is restricted to only send emails' }),
      }
    }) as unknown as typeof fetch

    const resend = byKey(await checkIntegrations(), 'resend')
    expect(resend.status).toBe('ok')
    expect(resend.detail).toMatch(/send-only/i)
  })

  it('still flags a genuinely invalid Resend key as unauthorized', async () => {
    global.fetch = jest.fn(async (url: unknown) => {
      if (!String(url).includes('resend')) return { ok: true, status: 200 }
      return {
        ok: false,
        status: 401,
        clone() { return this },
        json: async () => ({ statusCode: 401, name: 'invalid_api_key', message: 'API key is invalid' }),
      }
    }) as unknown as typeof fetch

    expect(byKey(await checkIntegrations(), 'resend').status).toBe('unauthorized')
  })

  it('never includes credential material in the reported detail', async () => {
    process.env.DAILY_API_KEY = 'super-secret-daily-key'
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch

    const results = await checkIntegrations()

    for (const r of results) {
      expect(r.detail).not.toContain('super-secret-daily-key')
    }
  })
})

describe('overallStatus', () => {
  const result = (over: Partial<IntegrationResult>): IntegrationResult => ({
    key: 'k', label: 'L', status: 'ok', detail: '', impact: '', required: true, durationMs: 1, ...over,
  })

  it('is ok when everything passes', () => {
    expect(overallStatus([result({}), result({ key: 'b' })])).toBe('ok')
  })

  it('is down when a required integration is broken', () => {
    expect(overallStatus([result({ status: 'unauthorized', required: true })])).toBe('down')
  })

  it('is only degraded when the broken integration is optional', () => {
    // Stripe being down shouldn't read the same as Postgres being down.
    expect(overallStatus([result({ status: 'not_configured', required: false })])).toBe('degraded')
  })
})

describe('missingRequiredEnv', () => {
  it('lists required secrets that are unset, with their impact', () => {
    delete process.env.JWT_SECRET
    const missing = missingRequiredEnv()
    expect(missing.map((m) => m.envVar)).toContain('JWT_SECRET')
    expect(missing.find((m) => m.envVar === 'JWT_SECRET')?.impact).toBeTruthy()
  })

  it('ignores optional secrets', () => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.CRON_SECRET
    expect(missingRequiredEnv()).toEqual([])
  })

  it('treats a set-but-blank value as missing', () => {
    // Render lets you save an env var with an empty value — it exists but is useless.
    process.env.ANTHROPIC_API_KEY = '   '
    expect(missingRequiredEnv().map((m) => m.envVar)).toContain('ANTHROPIC_API_KEY')
  })
})
