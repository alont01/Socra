import { NextResponse } from 'next/server'
import { route } from '@/lib/api-handler'
import { prisma } from '@/lib/prisma'
import { comparePassword } from '@/lib/password'
import { signToken } from '@/lib/auth'
import { loginSchema, parseBody } from '@/lib/validations'
import { rateLimitKeyForIp } from '@/lib/client-ip'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit, auditContext } from '@/lib/audit'
import { isInternalStudentEmail } from '@/lib/student-handle'

/**
 * Token login for native/mobile clients. Same credential check as /login but
 * returns the JWT in the response body (to store in SecureStore and send as
 * `Authorization: Bearer`) instead of setting an httpOnly cookie.
 */
export const POST = route('auth/token', async (request: Request) => {
  const ctx = auditContext(request)
  const ip = rateLimitKeyForIp(request)
  const rl = rateLimit(`token:${ip}`, { maxRequests: 10, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const body = await request.json()
  const parsed = parseBody(loginSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { email: rawEmail, password } = parsed.data
  const email = rawEmail.toLowerCase().trim()

  const user = await prisma.user.findUnique({
    where: { email },
    include: { studentProfile: true, parentProfile: true, tutorProfile: true },
  })

  if (!user || !user.passwordHash || !(await comparePassword(password, user.passwordHash))) {
    recordAudit({ action: 'auth.token', status: 'failure', actor: { email }, ...ctx, metadata: { client: 'mobile' } })
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  if (!user.emailVerified) {
    return NextResponse.json({ error: 'Please verify your email on the web first, then sign in here.' }, { status: 403 })
  }

  const token = await signToken({ userId: user.id, email: user.email, role: user.role })
  recordAudit({ action: 'auth.token', actor: { id: user.id, email: user.email, role: user.role }, ...ctx, metadata: { client: 'mobile' } })

  // Same masking as /api/auth/me and /login — a parent-created child's stored
  // email is a synthetic, non-deliverable placeholder, never a real address.
  const { passwordHash: _passwordHash, ...safeUser } = user
  const responseUser = { ...safeUser, email: isInternalStudentEmail(user.email) ? null : user.email }
  return NextResponse.json({ token, user: responseUser })
})
