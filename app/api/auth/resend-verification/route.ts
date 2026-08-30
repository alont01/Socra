import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resendVerificationSchema, parseBody } from '@/lib/validations'
import { rateLimitKeyForIp } from '@/lib/client-ip'
import { rateLimit } from '@/lib/rate-limit'
import { issueVerificationCode } from '@/lib/email-verification'
import { route } from '@/lib/api-handler'

export const POST = route('auth/resend-verification', async (request: Request) => {
  const ip = rateLimitKeyForIp(request)
  const rl = rateLimit(`resend-verify:${ip}`, { maxRequests: 3, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const body = await request.json()
  const parsed = parseBody(resendVerificationSchema, body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const email = parsed.data.email.toLowerCase().trim()

  const user = await prisma.user.findUnique({ where: { email } })

  // No account for this email: stay generic to avoid leaking which emails
  // exist — the client can't tell this apart from a normal send.
  if (!user) return NextResponse.json({ success: true })

  // Already verified: nothing to resend, and unlike the "no account" case
  // there's no enumeration risk in saying so — the caller is looking at their
  // own email on the verify screen. Mirrors verify-email's `alreadyVerified`.
  if (user.emailVerified) {
    return NextResponse.json(
      { error: 'This email is already verified. Please sign in.', alreadyVerified: true },
      { status: 409 },
    )
  }

  // From here the account is real and unverified, so a failed send is worth
  // reporting truthfully — the client already knows this address exists.
  const result = await issueVerificationCode(user.id, email)
  if (result.limited) {
    return NextResponse.json(
      { error: 'Too many codes requested. Please wait a bit and try again.' },
      { status: 429 },
    )
  }
  if (!result.sent) {
    return NextResponse.json(
      { error: 'Could not send the email right now. Please try again in a few minutes.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ success: true })
})
