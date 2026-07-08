import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { signToken } from '@/lib/auth'
import { signupSchema, parseBody } from '@/lib/validations'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit, auditContext } from '@/lib/audit'

export async function POST(request: Request) {
  const ctx = auditContext(request)
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const rl = rateLimit(`signup:${ip}`, { maxRequests: 5, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const body = await request.json()
    const parsed = parseBody(signupSchema, body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { email: rawEmail, password, role, name } = parsed.data
    const email = rawEmail.toLowerCase().trim()

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)

    // Signup is restricted to STUDENT | PARENT (see signupSchema); tutors are
    // created only via an admin invite.
    const profileData = role === 'STUDENT'
      ? { studentProfile: { create: { name } } }
      : { parentProfile: { create: { name } } }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        ...profileData,
      },
    })

    const token = await signToken({ userId: user.id, email: user.email, role: user.role })
    recordAudit({ action: 'auth.signup', actor: { id: user.id, email: user.email, role: user.role }, ...ctx, metadata: { role } })

    const response = NextResponse.json({ success: true })
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
