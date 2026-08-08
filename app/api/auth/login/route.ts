import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { comparePassword } from '@/lib/password'
import { signToken } from '@/lib/auth'
import { loginSchema, parseBody } from '@/lib/validations'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit, auditContext } from '@/lib/audit'
import { issueVerificationCode } from '@/lib/email-verification'

export async function POST(request: Request) {
  const ctx = auditContext(request)
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
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

    // Strip sensitive fields before sending to client
    const { passwordHash: _, ...safeUser } = user
    const response = NextResponse.json({ user: safeUser })
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return response
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
