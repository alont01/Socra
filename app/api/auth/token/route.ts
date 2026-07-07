import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { comparePassword } from '@/lib/password'
import { signToken } from '@/lib/auth'
import { loginSchema, parseBody } from '@/lib/validations'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit, auditContext } from '@/lib/audit'

/**
 * Token login for native/mobile clients. Same credential check as /login but
 * returns the JWT in the response body (to store in SecureStore and send as
 * `Authorization: Bearer`) instead of setting an httpOnly cookie.
 */
export async function POST(request: Request) {
  const ctx = auditContext(request)
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
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

    const token = await signToken({ userId: user.id, email: user.email, role: user.role })
    recordAudit({ action: 'auth.token', actor: { id: user.id, email: user.email, role: user.role }, ...ctx, metadata: { client: 'mobile' } })

    const { passwordHash: _omit, ...safeUser } = user
    return NextResponse.json({ token, user: safeUser })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
