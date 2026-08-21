import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { route } from '@/lib/api-handler'
import { config } from '@/lib/config'
import { sendEmail, passwordResetEmailHtml } from '@/lib/email'
import { createLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { forgotPasswordSchema, parseBody } from '@/lib/validations'

const logger = createLogger('auth/forgot-password')

export const POST = route('auth/forgot-password', async (request: Request) => {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const rl = rateLimit(`forgot-pw:${ip}`, { maxRequests: 3, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const body = await request.json()
  const parsed = parseBody(forgotPasswordSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const email = parsed.data.email.toLowerCase().trim()

  const user = await prisma.user.findUnique({ where: { email } })

  // Always return the same success response — whether the address is unknown or
  // belongs to an OAuth-only account with no password — so this endpoint can't
  // be used to enumerate registered emails or infer an account's auth method.
  if (!user || !user.passwordHash) {
    return NextResponse.json({ success: true })
  }

  // Clean up any existing tokens for this user
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })

  const token = crypto.randomBytes(32).toString('hex')
  const expiryMinutes = config.auth.passwordResetExpiryMinutes
  const expiresAt = new Date(Date.now() + expiryMinutes * 60_000)

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  })

  const authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const resetLink = `${authUrl}/auth/reset-password?token=${token}`

  const sent = await sendEmail({
    to: email,
    subject: 'Reset your Socra password',
    html: passwordResetEmailHtml(resetLink, expiryMinutes),
  })

  if (!sent) {
    if (process.env.NODE_ENV === 'production') {
      // The user asked to reset and will never get the link. The response is a
      // generic success by design, so this log line is the only signal.
      logger.error('Password reset email could not be sent', undefined, { userId: user.id })
    } else {
      // No provider configured locally — surface the link so the flow stays testable.
      logger.warn(`Password reset link (no email provider): ${resetLink}`)
    }
  }

  return NextResponse.json({ success: true })
})
