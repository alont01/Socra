import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { consultationSchema, parseBody } from '@/lib/validations'
import { rateLimitKeyForIp } from '@/lib/client-ip'
import { rateLimit } from '@/lib/rate-limit'
import { sendEmail, consultationTeamEmailHtml, consultationParentEmailHtml } from '@/lib/email'
import { recordEvent } from '@/lib/metrics'
import { bookingUrl } from '@/lib/booking'
import { ApiError, route } from '@/lib/api-handler'

// Where inbound lead notifications go. Defaults to the team inbox; override
// with TEAM_EMAIL in the environment.
const TEAM_EMAIL = process.env.TEAM_EMAIL || 'team@socratutoring.com'

// Public endpoint — no auth. A prospective parent submits the /get-started
// form; we persist the lead, notify the team, and confirm to the parent.
export const POST = route('consultation', async (request: Request) => {
  try {
    const ip = rateLimitKeyForIp(request)
    const rl = rateLimit(`consultation:${ip}`, { maxRequests: 5, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

    const parsed = parseBody(consultationSchema, body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const clean = (v?: string) => {
      const t = (v || '').trim()
      return t.length ? t : null
    }
    const email = parsed.data.email.toLowerCase().trim()
    const name = clean(parsed.data.name)
    const phone = clean(parsed.data.phone)
    const studentGrade = clean(parsed.data.studentGrade)
    const message = clean(parsed.data.message)
    const source = clean(parsed.data.source) || 'website'

    const lead = await prisma.consultationRequest.create({
      data: { email, name, phone, studentGrade, message, source },
    })

    recordEvent({
      category: 'lead',
      name: 'consultation.request',
      success: true,
      metadata: { id: lead.id, source },
    })

    // Notifications are best-effort — a delivery hiccup must not fail the lead
    // capture (it's already saved). Fire both, don't block the response on a
    // throw.
    const leadPayload = { email, name, phone, studentGrade, message, source }
    await Promise.allSettled([
      sendEmail({
        to: TEAM_EMAIL,
        subject: `New consultation request — ${name || email}`,
        html: consultationTeamEmailHtml(leadPayload),
      }),
      sendEmail({
        to: email,
        subject: 'We got your request — Socra',
        html: consultationParentEmailHtml(name, bookingUrl()),
      }),
    ])

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    // A dropped lead is lost revenue — record it against the lead funnel, not
    // just the generic HTTP error stream, then let the wrapper render the 500.
    recordEvent({
      category: 'lead',
      name: 'consultation.request',
      level: 'error',
      success: false,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    })
    throw new ApiError(500, 'Something went wrong. Please try again.', { cause: err })
  }
})
