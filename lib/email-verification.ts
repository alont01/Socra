import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, verificationEmailHtml } from '@/lib/email'

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
    // Local dev / no provider — surface the code in logs so signup is testable.
    console.log(`[email-verification] Code for ${email} (no email sent): ${code}`)
  }
}
