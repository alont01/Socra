import { NextResponse } from 'next/server'
import { route } from '@/lib/api-handler'
import { setAuthCookie } from '@/lib/auth-cookie'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'
import { verifyEmailSchema, parseBody } from '@/lib/validations'
import { rateLimitKeyForIp } from '@/lib/client-ip'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit, auditContext } from '@/lib/audit'
import { hashCode, MAX_VERIFY_ATTEMPTS } from '@/lib/email-verification'

export const POST = route('auth/verify-email', async (request: Request) => {
  const ctx = auditContext(request)
  const ip = rateLimitKeyForIp(request)
  const rl = rateLimit(`verify-email:${ip}`, { maxRequests: 10, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const body = await request.json()
  const parsed = parseBody(verifyEmailSchema, body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const email = parsed.data.email.toLowerCase().trim()
  const { code } = parsed.data

  const user = await prisma.user.findUnique({
    where: { email },
    include: { studentProfile: true, emailVerification: true },
  })
  if (!user) return NextResponse.json({ error: 'Invalid code' }, { status: 400 })

  // Already verified. This branch MUST NOT issue a session.
  //
  // It previously signed a token here to make a double-submit of the correct
  // code idempotent — but it never checked the code to get there, so anyone
  // who knew a registered address could POST any six digits and be handed that
  // account's cookie. The verification record is deleted on success, so once
  // an account is verified there is nothing left to check a code against and
  // no way to tell a retry from a forgery. The only safe answer is to send
  // them to sign in with the password they already set.
  if (user.emailVerified) {
    recordAudit({ action: 'auth.verify_email', status: 'failure', actor: { id: user.id, email, role: user.role }, ...ctx, metadata: { reason: 'already_verified' } })
    return NextResponse.json(
      { error: 'This email is already verified. Please sign in.', alreadyVerified: true },
      { status: 409 },
    )
  }

  const record = user.emailVerification
  if (!record) return NextResponse.json({ error: 'No verification pending. Request a new code.' }, { status: 400 })
  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This code has expired. Request a new one.' }, { status: 410 })
  }
  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 })
  }

  if (hashCode(code) !== record.codeHash) {
    await prisma.emailVerification.update({ where: { userId: user.id }, data: { attempts: { increment: 1 } } })
    recordAudit({ action: 'auth.verify_email', status: 'failure', actor: { id: user.id, email, role: user.role }, ...ctx })
    return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 })
  }

  // Success: mark verified, clear the code, log in.
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
    prisma.emailVerification.delete({ where: { userId: user.id } }),
  ])
  recordAudit({ action: 'auth.verify_email', actor: { id: user.id, email, role: user.role }, ...ctx })

  const token = await signToken({ userId: user.id, email: user.email, role: user.role })
  const res = NextResponse.json({ user: { id: user.id, role: user.role, studentProfile: user.studentProfile } })
  setAuthCookie(res, token)
  return res
})
