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

/** Notify a tutor that a new student offer is waiting (first to accept wins). */
export function tutorOfferEmailHtml(studentName: string, gradeLevel: string, slotLines: string[]): string {
  const grade = gradeLevel ? ` (Grade ${gradeLevel})` : ''
  const slots = slotLines.length
    ? `<p style="color:#57534e;margin:0 0 8px;line-height:1.6;">You both have these times free:</p>
       <ul style="color:#1c1917;margin:0 0 16px;padding-left:18px;line-height:1.7;">${slotLines.map((s) => `<li>${s}</li>`).join('')}</ul>`
    : ''
  return shell(`
    <h1 style="font-size:20px;font-weight:700;margin-bottom:8px;">New student match</h1>
    <p style="color:#57534e;margin-bottom:14px;line-height:1.6;">
      You're a great fit for <b>${studentName}</b>${grade}. This offer is open to a few tutors — the first to accept gets the student.
    </p>
    ${slots}
    <a href="https://socratutoring.com/dashboard" style="display:inline-block;background:#f97316;color:#fff;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:11px;font-size:15px;">
      Review the offer
    </a>
    <p style="color:#a8a29e;font-size:12px;margin-top:20px;">This offer expires in 48 hours.</p>
  `)
}

/** Tell the parent their child has been matched with a tutor. */
export function matchConfirmedParentEmailHtml(childName: string, tutorName: string): string {
  return shell(`
    <h1 style="font-size:22px;font-weight:700;margin-bottom:12px;">${childName} has a tutor! 🎉</h1>
    <p style="color:#57534e;margin-bottom:16px;line-height:1.6;">
      Great news — <b>${tutorName}</b> will be working with ${childName}. You'll be able to see sessions and progress on your dashboard.
    </p>
    <a href="https://socratutoring.com/parent/dashboard" style="display:inline-block;background:#f97316;color:#fff;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:11px;font-size:15px;">
      Open your dashboard
    </a>
  `)
}

/** A session was scheduled — sent to the parent (if linked) and/or the student. */
export function sessionScheduledEmailHtml(input: {
  recipientName?: string | null
  studentName: string
  tutorName: string
  topic: string
  whenText: string // pre-formatted date/time, or "Time to be confirmed"
  isParent: boolean
}): string {
  const greeting = input.recipientName?.trim() ? `Hi ${input.recipientName.trim()},` : 'Hi there,'
  const who = input.isParent ? `${input.studentName}'s` : 'Your'
  return shell(`
    <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 12px;">Session scheduled 📅</h1>
    <p style="color: #57534e; margin-bottom: 16px; line-height: 1.6;">${greeting}</p>
    <p style="color: #57534e; margin-bottom: 16px; line-height: 1.6;">
      ${who} next session with <b>${input.tutorName}</b> is set:
    </p>
    <table style="border-collapse: collapse; width: 100%; background: #fff7ed; border: 1px solid #ffedd5; border-radius: 12px;">
      <tr><td style="padding: 12px 16px; color: #78716c; font-size: 13px;">Topic</td><td style="padding: 12px 16px; color: #1c1917; font-size: 14px; font-weight: 600;">${input.topic || 'Math session'}</td></tr>
      <tr><td style="padding: 12px 16px; color: #78716c; font-size: 13px; border-top: 1px solid #ffedd5;">When</td><td style="padding: 12px 16px; color: #1c1917; font-size: 14px; font-weight: 600; border-top: 1px solid #ffedd5;">${input.whenText}</td></tr>
    </table>
    <p style="color: #78716c; font-size: 13px; margin-top: 20px; line-height: 1.5;">
      You'll find it on your Socra dashboard when it's time to join.
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
