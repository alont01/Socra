import { signToken, verifyToken, JWTPayload } from '@/lib/auth'
import { SignJWT } from 'jose'

// Set JWT_SECRET before tests run
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-chars-long'
})

describe('auth utilities', () => {
  const testPayload: JWTPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'student',
  }

  describe('signToken', () => {
    it('returns a string (JWT)', async () => {
      const token = await signToken(testPayload)
      expect(typeof token).toBe('string')
    })

    it('returns a JWT with three dot-separated parts', async () => {
      const token = await signToken(testPayload)
      const parts = token.split('.')
      expect(parts.length).toBe(3)
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
      expect(result).toHaveProperty('role', 'student')
    })

    it('returns null for an invalid token', async () => {
      const result = await verifyToken('this.is.not.a.valid.jwt')
      expect(result).toBeNull()
    })

    it('returns null for a tampered token', async () => {
      const token = await signToken(testPayload)
      // Tamper with the signature part
      const parts = token.split('.')
      const tamperedToken = `${parts[0]}.${parts[1]}.invalidsignature`
      const result = await verifyToken(tamperedToken)
      expect(result).toBeNull()
    })

    it('returns null for an expired token', async () => {
      // Create a token with a very short expiry using jose directly
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET || 'socra-super-secret-key-min-32-chars-here'
      )
      const expiredToken = await new SignJWT({ ...testPayload })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('-1s') // already expired 1 second ago
        .setIssuedAt()
        .sign(secret)

      const result = await verifyToken(expiredToken)
      expect(result).toBeNull()
    })

    it('returns null for an empty string', async () => {
      const result = await verifyToken('')
      expect(result).toBeNull()
    })
  })
})
