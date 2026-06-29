import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { forgotPasswordSchema, parseBody } from '@/lib/validations'

export async function POST(request: Request) {
  try {
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

    // Always return success to avoid leaking whether an email exists
    if (!user) {
      return NextResponse.json({ success: true })
    }

    // OAuth-only users have no password to reset — return same generic success
    // to avoid leaking whether the email exists or what auth method is used
    if (!user.passwordHash) {
      return NextResponse.json({ success: true })
    }

    // Clean up any existing tokens for this user
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })

    // Generate a secure token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    })

    const authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const resetLink = `${authUrl}/auth/reset-password?token=${token}`

    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'noreply@socratutoring.com',
        to: email,
        subject: 'Reset your Socra password',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1c1917;">
            <div style="margin-bottom: 24px;">
              <span style="font-size: 28px; font-weight: 700; color: #f97316;">∑</span>
              <span style="font-size: 20px; font-weight: 700; color: #1c1917; margin-left: 6px;">Socra</span>
            </div>
            <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 12px;">Reset your password</h1>
            <p style="color: #57534e; margin-bottom: 24px; line-height: 1.6;">
              We received a request to reset the password for your account. Click the button below to choose a new password.
              This link expires in 1 hour.
            </p>
            <a href="${resetLink}"
               style="display: inline-block; padding: 12px 28px; background: #f97316; color: #fff; font-weight: 600; border-radius: 12px; text-decoration: none;">
              Reset Password
            </a>
            <p style="color: #78716c; font-size: 13px; margin-top: 24px; line-height: 1.5;">
              If you didn't request a password reset, you can safely ignore this email.
            </p>
          </div>
        `,
      })
    } else {
      // No email provider configured — log the link for local development
      console.log(`[forgot-password] Reset link (no RESEND_API_KEY): ${resetLink}`)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[forgot-password]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
