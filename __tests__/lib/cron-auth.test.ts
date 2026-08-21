/**
 * @jest-environment node
 */
import { isAuthorizedCron } from '@/lib/cron-auth'

const req = (authorization?: string) =>
  new Request('https://socra.test/api/cron/sweep-sessions', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })

const ORIGINAL = process.env.CRON_SECRET

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  jest.restoreAllMocks()
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL
})

describe('isAuthorizedCron', () => {
  it('accepts the correct bearer token', () => {
    process.env.CRON_SECRET = 'super-secret-value'
    expect(isAuthorizedCron(req('Bearer super-secret-value'))).toBe(true)
  })

  it('rejects a wrong token', () => {
    process.env.CRON_SECRET = 'super-secret-value'
    expect(isAuthorizedCron(req('Bearer wrong-value-here!'))).toBe(false)
  })

  it('rejects a token that is merely a prefix of the secret', () => {
    process.env.CRON_SECRET = 'super-secret-value'
    expect(isAuthorizedCron(req('Bearer super'))).toBe(false)
  })

  it('rejects a missing header', () => {
    process.env.CRON_SECRET = 'super-secret-value'
    expect(isAuthorizedCron(req())).toBe(false)
  })

  it('rejects a non-Bearer scheme', () => {
    process.env.CRON_SECRET = 'super-secret-value'
    expect(isAuthorizedCron(req('Basic super-secret-value'))).toBe(false)
  })

  it('fails closed when CRON_SECRET is unset', () => {
    delete process.env.CRON_SECRET
    // An unset secret must never mean "allow anyone" on an endpoint that
    // mutates session and billing state.
    expect(isAuthorizedCron(req('Bearer anything'))).toBe(false)
  })

  it('fails closed when CRON_SECRET is set but blank', () => {
    process.env.CRON_SECRET = ''
    expect(isAuthorizedCron(req('Bearer '))).toBe(false)
  })
})
