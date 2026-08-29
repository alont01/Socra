import { NextResponse } from 'next/server'
import { route } from '@/lib/api-handler'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { signupSchema, parseBody } from '@/lib/validations'
import { rateLimitKeyForIp } from '@/lib/client-ip'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit, auditContext } from '@/lib/audit'
import { issueVerificationCode } from '@/lib/email-verification'

export const POST = route('auth/signup', async (request: Request) => {
  const ctx = auditContext(request)
  const ip = rateLimitKeyForIp(request)
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

  let user
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        emailVerified: false,
        ...profileData,
      },
    })
  } catch (createErr) {
    // Unique-constraint collision — two concurrent signups for the same email
    // raced past the findUnique check above. Return the same 409 as the
    // sequential case rather than a 500.
    if (createErr && typeof createErr === 'object' && (createErr as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    throw createErr
  }

  // Email a verification code. The account is not logged in until verified.
  await issueVerificationCode(user.id, email)
  recordAudit({ action: 'auth.signup', actor: { id: user.id, email: user.email, role: user.role }, ...ctx, metadata: { role } })

  return NextResponse.json({ needsVerification: true, email })
})
