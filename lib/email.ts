import { createLogger } from '@/lib/logger'

const logger = createLogger('email')

interface SendEmailInput {
  to: string
  subject: string
  html: string
}

/**
 * Send an email via Resend. If RESEND_API_KEY isn't configured (local dev),
 * logs instead of sending and returns false. Never throws into the caller.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn('RESEND_API_KEY not set — email not sent', { to, subject })
    return false
  }
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({ from: 'noreply@socratutoring.com', to, subject, html })
    return true
  } catch (err) {
    logger.error('Failed to send email', err, { to, subject })
    return false
  }
}

const shell = (body: string) => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1c1917;">
    <div style="margin-bottom: 24px;">
      <span style="font-size: 28px; font-weight: 700; color: #f97316;">∑</span>
      <span style="font-size: 20px; font-weight: 700; color: #1c1917; margin-left: 6px;">Socra</span>
    </div>
    ${body}
  </div>
`

export function verificationEmailHtml(code: string): string {
  return shell(`
    <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 12px;">Verify your email</h1>
    <p style="color: #57534e; margin-bottom: 24px; line-height: 1.6;">
      Enter this code to finish creating your Socra account. It expires in 15 minutes.
    </p>
    <div style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #f97316; background: #fff7ed; border: 1px solid #ffedd5; border-radius: 12px; padding: 16px; text-align: center;">
      ${code}
    </div>
    <p style="color: #78716c; font-size: 13px; margin-top: 24px; line-height: 1.5;">
      If you didn't create a Socra account, you can safely ignore this email.
    </p>
  `)
}
