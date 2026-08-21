import type { NextResponse } from 'next/server'
import { config } from '@/lib/config'

/**
 * The session cookie is set from six different places (password login, email
 * verification, OAuth completion, role selection, tutor-invite redemption, role
 * switch). Those copies drifted from each other and from
 * `config.auth.jwtExpirySeconds`; this is the one definition.
 */
export const AUTH_COOKIE = 'token'

// NextAuth's own cookies are cleared alongside ours on logout so an OAuth
// session can't outlive the app session. The `__Secure-` variant is what
// NextAuth writes over HTTPS.
const NEXTAUTH_COOKIES = ['next-auth.session-token', '__Secure-next-auth.session-token'] as const

/** Attach the signed session JWT. Must stay in sync with `signToken`'s expiry. */
export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: config.auth.jwtExpirySeconds,
    path: '/',
  })
}

/** Clear the session JWT and any NextAuth session riding alongside it. */
export function clearAuthCookie(response: NextResponse): void {
  response.cookies.delete(AUTH_COOKIE)
  for (const name of NEXTAUTH_COOKIES) response.cookies.delete(name)
}
