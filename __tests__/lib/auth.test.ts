import { signToken, verifyToken, JWTPayload } from '@/lib/auth'

// Mock jose with a CJS-compatible implementation using Node crypto
jest.mock('jose', () => {
  const crypto = require('crypto')

  class MockSignJWT {
    private payload: Record<string, unknown>
    private header: Record<string, unknown> = {}

    constructor(payload: Record<string, unknown>) {
      this.payload = { ...payload }
    }

    setProtectedHeader(header: Record<string, unknown>) {
      this.header = header
      return this
    }

    setExpirationTime(exp: string | number) {
      if (typeof exp === 'string' && exp.endsWith('d')) {
        this.payload.exp = Math.floor(Date.now() / 1000) + parseInt(exp) * 86400
      } else if (typeof exp === 'number') {
        this.payload.exp = exp
      }
      return this
    }

    setIssuedAt() {
      this.payload.iat = Math.floor(Date.now() / 1000)
      return this
    }

    async sign(secret: Uint8Array) {
      const header = Buffer.from(JSON.stringify(this.header)).toString('base64url')
      const payload = Buffer.from(JSON.stringify(this.payload)).toString('base64url')
      const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
      return `${header}.${payload}.${sig}`
    }
  }

  const jwtVerify = async (token: string, secret: Uint8Array) => {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Invalid token')
    const [h, p, sig] = parts
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')
    if (sig !== expected) throw new Error('Invalid signature')
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired')
    return { payload }
  }

  return { SignJWT: MockSignJWT, jwtVerify }
})

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-chars-long'
})

describe('auth utilities', () => {
  const testPayload: JWTPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'STUDENT',
  }

  describe('signToken', () => {
    it('returns a string (JWT)', async () => {
      const token = await signToken(testPayload)
      expect(typeof token).toBe('string')
    })

    it('returns a JWT with three dot-separated parts', async () => {
      const token = await signToken(testPayload)
      expect(token.split('.').length).toBe(3)
    })
  })

  describe('verifyToken', () => {
    it('returns the payload for a valid token', async () => {
      const token = await signToken(testPayload)
      const result = await verifyToken(token)
      expect(result).not.toBeNull()
      expect(result?.userId).toBe(testPayload.userId)
      expect(result?.email).toBe(testPayload.email)
      expect(result?.role).toBe(testPayload.role)
    })

    it('payload contains userId, email, role', async () => {
      const token = await signToken(testPayload)
      const result = await verifyToken(token)
      expect(result).toHaveProperty('userId', 'user-123')
      expect(result).toHaveProperty('email', 'test@example.com')
      expect(result).toHaveProperty('role', 'STUDENT')
    })

    it('returns null for an invalid token', async () => {
      expect(await verifyToken('not.a.valid.jwt')).toBeNull()
    })

    it('returns null for a tampered token', async () => {
      const token = await signToken(testPayload)
      const [h, p] = token.split('.')
      expect(await verifyToken(`${h}.${p}.badsignature`)).toBeNull()
    })

    it('returns null for an empty string', async () => {
      expect(await verifyToken('')).toBeNull()
    })

    it('returns null for a token with a malformed payload', async () => {
      // header.notbase64url.sig
      expect(await verifyToken('eyJhbGciOiJIUzI1NiJ9.!!!.abc')).toBeNull()
    })
  })
})
