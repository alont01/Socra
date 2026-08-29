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
  // Only (re)issue for an existing, still-unverified account. Always return
  // generic success to avoid leaking which emails exist.
  if (user && !user.emailVerified) {
    await issueVerificationCode(user.id, email)
  }

  return NextResponse.json({ success: true })
})
