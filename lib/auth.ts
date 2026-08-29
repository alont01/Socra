import { SignJWT, jwtVerify } from 'jose'
import { config } from './config'

const DEV_FALLBACK_SECRET = 'dev-only-secret-key-min-32-chars-here!!'

let cachedSecret: Uint8Array | undefined

/**
 * The HMAC key for session JWTs.
 *
 * Resolved lazily and memoized rather than at module load: `next build`
 * evaluates every route module to collect page data, and a top-level throw here
 * made a missing JWT_SECRET fail the *build* with an opaque stack trace instead
 * of failing the first request with a clear one. Production still refuses to
 * serve without a real secret — just at the point where it actually matters.
 */
function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret

  const key = process.env.JWT_SECRET
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production')
    }
    cachedSecret = new TextEncoder().encode(DEV_FALLBACK_SECRET)
    return cachedSecret
  }

  cachedSecret = new TextEncoder().encode(key)
  return cachedSecret
}

export interface JWTPayload {
  userId: string
  email: string
  role: string
  /**
   * Issued-at, in epoch seconds — set by `signToken`'s `.setIssuedAt()`.
   *
   * Checked against `User.sessionsValidFrom` so a password reset can invalidate
   * tokens that were handed out before it. Optional because a token minted
   * before this field was read still verifies; `requireAuth` treats a missing
   * `iat` on an account that HAS reset as too old to trust.
   */
  iat?: number
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    // Absolute epoch seconds, from the same constant as the cookie's maxAge
    // (lib/auth-cookie.ts), so the token and the cookie carrying it can never
    // expire at different times.
    .setExpirationTime(Math.floor(Date.now() / 1000) + config.auth.jwtExpirySeconds)
    .setIssuedAt()
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}
