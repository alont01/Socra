/**
 * @jest-environment node
 */
import { requireAuth } from '@/lib/api-auth'
import { signToken } from '@/lib/auth'

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
  headers: jest.fn(),
}))
jest.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: jest.fn() } } }))
jest.mock('@/lib/request-context', () => ({ setRequestActor: jest.fn() }))

const { cookies, headers } = jest.requireMock('next/headers') as {
  cookies: jest.Mock
  headers: jest.Mock
}
const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: { user: { findUnique: jest.Mock } }
}

const USER_ID = 'user_1'

const withToken = (token: string | undefined) => {
  cookies.mockResolvedValue({ get: () => (token ? { value: token } : undefined) })
  headers.mockResolvedValue({ get: () => null })
}

const issueToken = () => signToken({ userId: USER_ID, email: 'kid@socra.test', role: 'STUDENT' })

beforeEach(() => jest.clearAllMocks())

describe('requireAuth — password-reset session cutoff', () => {
  it('accepts a token issued after the account last reset', async () => {
    const token = await issueToken()
    prisma.user.findUnique.mockResolvedValue({
      sessionsValidFrom: new Date(Date.now() - 60_000),
    })
    withToken(token)

    const result = await requireAuth()

    expect(result.ok).toBe(true)
  })

  it('rejects a token that predates the reset', async () => {
    // The whole point of a reset is evicting whoever already has a session. A
    // valid signature alone used to be enough, so the person you reset the
    // password because of kept full access for the rest of the 7-day expiry.
    const token = await issueToken()
    prisma.user.findUnique.mockResolvedValue({
      sessionsValidFrom: new Date(Date.now() + 60_000),
    })
    withToken(token)

    const result = await requireAuth()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
      expect((await result.response.json()).error).toMatch(/sign in again/i)
    }
  })

  it('accepts every token on an account that has never reset', async () => {
    const token = await issueToken()
    prisma.user.findUnique.mockResolvedValue({ sessionsValidFrom: null })
    withToken(token)

    expect((await requireAuth()).ok).toBe(true)
  })

  it('rejects a token with no issued-at once the account has reset', async () => {
    // A token that cannot be placed in time cannot be shown to postdate the
    // reset. Refusing costs one extra sign-in; trusting it defeats the reset.
    const { SignJWT } = await import('jose')
    const noIat = await new SignJWT({ userId: USER_ID, email: 'kid@socra.test', role: 'STUDENT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET || 'dev-only-secret-key-min-32-chars-here!!'))
    prisma.user.findUnique.mockResolvedValue({ sessionsValidFrom: new Date(Date.now() - 60_000) })
    withToken(noIat)

    expect((await requireAuth()).ok).toBe(false)
  })

  it('rejects a live token whose user row is gone', async () => {
    const token = await issueToken()
    prisma.user.findUnique.mockResolvedValue(null)
    withToken(token)

    const result = await requireAuth()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('still 401s with no token at all, without touching the database', async () => {
    withToken(undefined)

    expect((await requireAuth()).ok).toBe(false)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })
})
