import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, verificationEmailHtml } from '@/lib/email'
import { createLogger } from '@/lib/logger'

const logger = createLogger('email-verification')

const CODE_TTL_MS = 15 * 60 * 1000 // 15 minutes
export const MAX_VERIFY_ATTEMPTS = 6

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Generate a fresh 6-digit code for a user, store it hashed (replacing any
 * existing one), and email it. Returns the code for local-dev logging only.
 */
export async function issueVerificationCode(userId: string, email: string): Promise<void> {
  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)

  await prisma.emailVerification.upsert({
    where: { userId },
    create: { userId, codeHash: hashCode(code), expiresAt, attempts: 0 },
    update: { codeHash: hashCode(code), expiresAt, attempts: 0 },
  })

  const sent = await sendEmail({
    to: email,
    subject: 'Your Socra verification code',
    html: verificationEmailHtml(code),
  })
  if (!sent) {
    if (process.env.NODE_ENV === 'production') {
      // The user is now stuck at the verification step with no way through.
      // The code itself must never reach a production log.
      logger.error('Verification email could not be sent; user cannot complete signup', undefined, { userId })
    } else {
      // Local dev / no provider — surface the code so signup stays testable.
      logger.warn(`Verification code for ${email} (no email sent): ${code}`)
    }
  }
}
