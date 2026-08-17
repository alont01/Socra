import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getMonthlyBilling, monthBounds } from '@/lib/billing'

// This month's (or a requested month's) billable hours per family, cross-
// referenced against already-sent invoices so the admin view can show status
// and avoid double-billing.
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const monthParam = searchParams.get('month') // "2026-08"
    const reference = monthParam ? new Date(`${monthParam}-01T00:00:00Z`) : new Date()
    const { start, end } = monthBounds(reference)

    const [billing, existingInvoices] = await Promise.all([
      getMonthlyBilling(start, end),
      prisma.invoice.findMany({
        where: { periodStart: start, periodEnd: end },
        select: { parentId: true, status: true, stripeInvoiceUrl: true, sentAt: true },
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
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    })
  } catch (err) {
    console.error('[admin billing]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
