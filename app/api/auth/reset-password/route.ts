import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { rateLimitKeyForIp } from '@/lib/client-ip'
import { rateLimit } from '@/lib/rate-limit'
import { resetPasswordSchema, parseBody } from '@/lib/validations'
import { route } from '@/lib/api-handler'

export const POST = route('auth/reset-password', async (request: Request) => {
  const ip = rateLimitKeyForIp(request)
  const rl = rateLimit(`reset-pw:${ip}`, { maxRequests: 5, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const body = await request.json()
  const parsed = parseBody(resetPasswordSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { token, password } = parsed.data

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!resetToken || resetToken.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
  }

  const passwordHash = await hashPassword(password)

  // `sessionsValidFrom` evicts every JWT issued before now. A reset is usually
  // done because someone else has the old password; leaving their existing
  // cookie working for the rest of its 7-day life defeats the point.
  await prisma.user.update({
    where: { id: resetToken.userId },
    data: { passwordHash, sessionsValidFrom: new Date() },
  })

  await prisma.passwordResetToken.delete({ where: { token } })

  return NextResponse.json({ success: true })
})
