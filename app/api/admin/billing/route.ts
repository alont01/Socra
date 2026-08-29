import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getMonthlyBilling, monthBounds } from '@/lib/billing'
import { route } from '@/lib/api-handler'
import { config } from '@/lib/config'

// This month's (or a requested month's) billable hours per family, cross-
// referenced against already-sent invoices so the admin view can show status
// and avoid double-billing.
export const GET = route('admin/billing', async (request: Request) => {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month') // "2026-08"
  if (monthParam && !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }
  const reference = monthParam ? new Date(`${monthParam}-01T00:00:00Z`) : new Date()
  const { start, end } = monthBounds(reference)

  const [billing, existingInvoices] = await Promise.all([
    getMonthlyBilling(start, end),
    prisma.invoice.findMany({
      where: { periodStart: start, periodEnd: end },
      select: {
        parentId: true,
        status: true,
        stripeInvoiceUrl: true,
        sentAt: true,
        paidAt: true,
        amountCents: true,
        lastError: true,
      },
    }),
  ])

  const invoiceByParent = new Map(existingInvoices.map((i) => [i.parentId, i]))
  const rows = billing.map((b) => ({
    ...b,
    invoice: invoiceByParent.get(b.parentId) ?? null,
  }))

  return NextResponse.json({
    period: { start, end },
    rows,
    // Sent independently of `rows`. The page used to read the rate off the
    // first row, so a month with nothing to bill — a quiet month, or the first
    // one ever — rendered "Hours billed at $—/hr" and looked broken. The rate
    // is a config constant; it exists whether or not anyone owes anything.
    rateUsd: config.billing.hourlyRateUsd,
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    // Surfaced so the admin page can warn that payment status won't update on
    // its own — the most consequential thing to get wrong in this flow.
    webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
  })
})
