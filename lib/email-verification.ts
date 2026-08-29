import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, verificationEmailHtml } from '@/lib/email'
import { createLogger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'

const logger = createLogger('email-verification')

const CODE_TTL_MS = 15 * 60 * 1000 // 15 minutes
export const MAX_VERIFY_ATTEMPTS = 6

/**
 * How many times a code may be (re)issued for one account per hour.
 *
 * Every issuance resets `attempts` to 0 — that's what makes a resend useful
 * after a mistyped code, but it's also what MAX_VERIFY_ATTEMPTS actually rests
 * on: the guess budget is only 6 per *code*, not 6 total. `/resend-verification`
 * and the login-while-unverified path are rate-limited per IP, which bounds
 * nothing for an attacker spraying from rotating addresses — this limiter is
 * keyed on the account instead, so the guess budget stays bounded (5 reissues
 * × 6 guesses/hour against a 1-in-1,000,000 code) regardless of source IP.
 */
const MAX_ISSUANCES_PER_HOUR = 5

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Generate a fresh 6-digit code for a user, store it hashed (replacing any
 * existing one), and email it. Returns the code for local-dev logging only.
 *
 * No-ops (leaving any current code and its attempt count untouched) once the
 * per-account issuance limit is hit within the hour — silently, since the
 * caller already returns a generic "check your email" response to avoid
 * confirming account existence, and this must not change that.
 */
export async function issueVerificationCode(userId: string, email: string): Promise<void> {
  const rl = rateLimit(`verify-code-issue:${userId}`, {
    maxRequests: MAX_ISSUANCES_PER_HOUR,
    windowMs: 60 * 60_000,
  })
  if (rl.limited) {
    logger.warn('Verification code re-issuance rate-limited for this account', { userId })
    return
  }

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
