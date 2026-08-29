import { NextResponse } from 'next/server'
import { route } from '@/lib/api-handler'
import { setAuthCookie } from '@/lib/auth-cookie'
import { prisma } from '@/lib/prisma'
import { comparePassword } from '@/lib/password'
import { signToken } from '@/lib/auth'
import { loginSchema, parseBody } from '@/lib/validations'
import { rateLimitKeyForIp } from '@/lib/client-ip'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit, auditContext } from '@/lib/audit'
import { issueVerificationCode } from '@/lib/email-verification'
import { isInternalStudentEmail } from '@/lib/student-handle'

export const POST = route('auth/login', async (request: Request) => {
  const ctx = auditContext(request)
  const ip = rateLimitKeyForIp(request)
  const rl = rateLimit(`login:${ip}`, { maxRequests: 10, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const body = await request.json()
  const parsed = parseBody(loginSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { email: rawIdentifier, password } = parsed.data
  // Identifier is an email OR a username (parent-created student accounts).
  const identifier = rawIdentifier.toLowerCase().trim()
  const isEmail = identifier.includes('@')

  const user = await prisma.user.findUnique({
    where: isEmail ? { email: identifier } : { username: identifier },
    include: { studentProfile: true, parentProfile: true, tutorProfile: true },
  })

  if (!user || !user.passwordHash) {
    recordAudit({ action: 'auth.login', status: 'failure', actor: { email: identifier }, ...ctx, metadata: { reason: 'no_account' } })
    return NextResponse.json({ error: 'Invalid email/username or password' }, { status: 401 })
  }

  const valid = await comparePassword(password, user.passwordHash)
  if (!valid) {
    recordAudit({ action: 'auth.login', status: 'failure', actor: { id: user.id, email: user.email, role: user.role }, ...ctx, metadata: { reason: 'bad_password' } })
    return NextResponse.json({ error: 'Invalid email/username or password' }, { status: 401 })
  }

  // Unverified email/password accounts must verify before logging in. Re-issue
  // a fresh code and route the client to the verification step. (Parent-created
  // student accounts are created emailVerified, so they never hit this.)
  if (!user.emailVerified) {
    await issueVerificationCode(user.id, user.email)
    recordAudit({ action: 'auth.login', status: 'failure', actor: { id: user.id, email: user.email, role: user.role }, ...ctx, metadata: { reason: 'unverified' } })
    return NextResponse.json({ needsVerification: true, email: user.email }, { status: 403 })
  }

  const token = await signToken({ userId: user.id, email: user.email, role: user.role })
  recordAudit({ action: 'auth.login', actor: { id: user.id, email: user.email, role: user.role }, ...ctx })

  // Strip sensitive fields before sending to client. A parent-created child's
  // stored email is a synthetic, non-deliverable @students.socra.internal
  // placeholder (see lib/student-handle.ts) — an internal key, not a contact
  // address, and must not reach the client any more than /api/auth/me does.
  const { passwordHash: _passwordHash, ...safeUser } = user
  const responseUser = { ...safeUser, email: isInternalStudentEmail(user.email) ? null : user.email }
  const response = NextResponse.json({ user: responseUser })
  setAuthCookie(response, token)

  return response
})
