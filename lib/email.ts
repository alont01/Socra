import { createLogger } from '@/lib/logger'
import { trackedCall } from '@/lib/metrics'

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
    await trackedCall({ category: 'email', name: 'email.send', metadata: { to, subject } }, () =>
      resend.emails.send({ from: 'noreply@socratutoring.com', to, subject, html }),
    )
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

interface ConsultationLead {
  email: string
  name?: string | null
  phone?: string | null
  studentGrade?: string | null
  message?: string | null
  source?: string | null
}

const row = (label: string, value?: string | null) =>
  value && value.trim()
    ? `<tr><td style="padding: 4px 12px 4px 0; color: #78716c; font-size: 13px; vertical-align: top;">${label}</td><td style="padding: 4px 0; color: #1c1917; font-size: 14px;">${value}</td></tr>`
    : ''

/** Internal notification to the team when a parent requests a consultation. */
export function consultationTeamEmailHtml(lead: ConsultationLead): string {
  return shell(`
    <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 6px;">New consultation request</h1>
    <p style="color: #57534e; margin-bottom: 20px; line-height: 1.6; font-size: 14px;">
      A parent just reached out from the website. Follow up soon to book their free first session.
    </p>
    <table style="border-collapse: collapse; width: 100%; background: #fff7ed; border: 1px solid #ffedd5; border-radius: 12px; padding: 8px;">
      ${row('Email', lead.email)}
      ${row('Name', lead.name)}
      ${row('Phone', lead.phone)}
      ${row('Student grade', lead.studentGrade)}
      ${row('Message', lead.message)}
      ${row('Source', lead.source)}
    </table>
    <p style="color: #a8a29e; font-size: 12px; margin-top: 20px;">Sent automatically by Socra.</p>
  `)
}

/**
 * Auto-reply confirming to the parent that we received their request.
 * `bookingUrl` (the Cal.com/Calendly link) is used for the button so the parent
 * can book straight from the email; when it's not configured we ask them to
 * reply, rather than linking back to a page with no scheduler.
 */
export function consultationParentEmailHtml(name?: string | null, bookingUrl?: string | null): string {
  const greeting = name && name.trim() ? `Hi ${name.trim()},` : 'Hi there,'
  const link = bookingUrl && bookingUrl.trim() ? bookingUrl.trim() : ''
  const body = link
    ? `We got your request for a free consultation with Socra. Pick a time that works for you and
       we'll take it from there:`
    : `We got your request for a free consultation with Socra. A member of our team will be in touch
       very shortly to find a time that works for you.`
  const button = link
    ? `<a href="${link}" style="display: inline-block; background: #f97316; color: #fff; font-weight: 600; text-decoration: none; padding: 12px 22px; border-radius: 11px; font-size: 15px;">
         Pick your session time
       </a>`
    : ''
  return shell(`
    <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 12px;">Thanks for reaching out!</h1>
    <p style="color: #57534e; margin-bottom: 16px; line-height: 1.6;">${greeting}</p>
    <p style="color: #57534e; margin-bottom: 16px; line-height: 1.6;">${body}</p>
    ${button}
    <p style="color: #78716c; font-size: 13px; margin-top: 24px; line-height: 1.5;">
      Questions? Just reply to this email or call (518) 645-2165.
    </p>
  `)
}

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
