import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { billableHours, monthBounds } from '@/lib/billing'
import { config } from '@/lib/config'
import { route } from '@/lib/api-handler'

/** Invoices are kept for the life of the account; show a sensible window. */
const INVOICE_LIMIT = 24

/**
 * GET — the parent's own billing view: past invoices plus the hours accruing
 * this month.
 *
 * Parents are the billed party but had no in-app visibility at all — the Stripe
 * email was the only artifact, so "what am I being charged for?" had no answer
 * short of asking support. This is read-only; every money-moving operation
 * stays on the admin side.
 */
export const GET = route('parent/billing', async () => {
  const auth = await requireParent()
  if (!auth.ok) return auth.response

  const { start, end } = monthBounds(new Date())

  const [invoices, children] = await Promise.all([
    prisma.invoice.findMany({
      where: { parentId: auth.parent.id },
      orderBy: { periodStart: 'desc' },
      take: INVOICE_LIMIT,
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        hours: true,
        rateUsd: true,
        amountCents: true,
        status: true,
        sentAt: true,
        paidAt: true,
        stripeInvoiceUrl: true,
      },
    }),
    prisma.studentProfile.findMany({
      where: { parentId: auth.parent.id },
      select: { id: true, name: true },
    }),
  ])

  // Hours delivered so far this period, computed the same way billing does it —
  // capped at the booked length, so this can't quote a number lower than the
  // invoice that follows. Filtered on `startedAt` within the period, exactly
  // like getMonthlyBilling: filtering on `endedAt` instead let a session that
  // started late one month and ended early the next appear in a different
  // month here than the one it's actually invoiced under.
  const childIds = children.map((c) => c.id)
  const sessions = childIds.length
    ? await prisma.tutoringSession.findMany({
        where: {
          studentId: { in: childIds },
          status: 'completed',
          startedAt: { not: null, gte: start, lt: end },
          endedAt: { not: null },
        },
        select: { studentId: true, startedAt: true, endedAt: true, scheduledMinutes: true },
      })
    : []

  const hoursByChild = new Map<string, number>()
  for (const s of sessions) {
    if (!s.startedAt || !s.endedAt || !s.studentId) continue
    const hours = billableHours(s.startedAt, s.endedAt, s.scheduledMinutes)
    hoursByChild.set(s.studentId, (hoursByChild.get(s.studentId) ?? 0) + hours)
  }

  const currentChildren = children
    .map((c) => ({ studentId: c.id, name: c.name, hours: Number((hoursByChild.get(c.id) ?? 0).toFixed(2)) }))
    .filter((c) => c.hours > 0)
  const currentHours = currentChildren.reduce((sum, c) => sum + c.hours, 0)
  // Priced the same way lib/billing.ts's aggregateBilling prices the real
  // invoice: summed per-child, each rounded to the nearest cent, rather than
  // rounding the combined total once. For an integer HOURLY_RATE_USD the two
  // agree, but a fractional rate can round each child's cents differently
  // than it rounds the total — and this is an estimate the eventual invoice
  // must never come in ABOVE.
  const estimatedAmountCents = currentChildren.reduce(
    (sum, c) => sum + Math.round(c.hours * config.billing.hourlyRateUsd * 100),
    0,
  )

  // Not yet invoiced — an estimate, and labelled as one by the UI.
  const alreadyInvoiced = invoices.some(
    (i) => i.periodStart.getTime() === start.getTime() && i.status !== 'failed',
  )

  return NextResponse.json({
    rateUsd: config.billing.hourlyRateUsd,
    currentPeriod: {
      start,
      end,
      hours: Number(currentHours.toFixed(2)),
      estimatedAmountCents,
      children: currentChildren,
      alreadyInvoiced,
    },
    invoices,
  })
})
