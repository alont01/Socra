import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { parseBody } from '@/lib/validations'
import { getMonthlyBilling, monthBounds } from '@/lib/billing'
import { sendMonthlyInvoice, BillingNotConfiguredError } from '@/lib/stripe-invoicing'
import { recordAudit, auditContext } from '@/lib/audit'

const sendSchema = z.object({
  parentId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
})

// POST — send one family's invoice for the given month. Recomputes the
// billing amount server-side from real session data rather than trusting
// anything from the client — this triggers a real charge-request to a parent.
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    const parsed = parseBody(sendSchema, body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { start, end } = monthBounds(new Date(`${parsed.data.month}-01T00:00:00Z`))

    const existing = await prisma.invoice.findUnique({
      where: { parentId_periodStart_periodEnd: { parentId: parsed.data.parentId, periodStart: start, periodEnd: end } },
    })
    if (existing) {
      return NextResponse.json({ error: 'This family has already been invoiced for this period.' }, { status: 409 })
    }

    const billing = await getMonthlyBilling(start, end)
    const row = billing.find((b) => b.parentId === parsed.data.parentId)
    if (!row) {
      return NextResponse.json({ error: 'No billable hours found for this family in this period.' }, { status: 400 })
    }

    const result = await sendMonthlyInvoice(row, start, end)

    recordAudit({
      action: 'billing.invoice.send',
      actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role },
      targetType: 'parent',
      targetId: row.parentId,
      metadata: { amountCents: row.amountCents, hours: row.totalHours, month: parsed.data.month },
      ...auditContext(request),
    })

    return NextResponse.json({ invoiceId: result.id, hostedUrl: result.hostedUrl })
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) {
      return NextResponse.json({ error: 'Stripe isn\'t configured yet — add STRIPE_SECRET_KEY to send invoices.' }, { status: 400 })
    }
    console.error('[admin billing send]', err)
    return NextResponse.json({ error: 'Could not send the invoice. Please try again.' }, { status: 500 })
  }
}
