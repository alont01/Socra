import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/api-auth'
import { route } from '@/lib/api-handler'
import { getMonthlyBilling, monthBounds } from '@/lib/billing'
import { claimAndSendInvoice, type SendFailureCode } from '@/lib/billing-send'
import { recordAudit, auditContext } from '@/lib/audit'
import { parseBody, yearMonthSchema } from '@/lib/validations'

const sendSchema = z.object({
  parentId: z.string().min(1),
  month: yearMonthSchema,
})

/** HTTP status for each expected send failure. */
const FAILURE_STATUS: Record<SendFailureCode, number> = {
  already_invoiced: 409,
  no_billable_hours: 400,
  not_configured: 400,
  stripe_failed: 502,
}

// POST — send one family's invoice for the given month. The billing amount is
// recomputed server-side from real session data rather than trusted from the
// client; this triggers a real charge-request to a parent.
export const POST = route('admin/billing/send', async (request: Request) => {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = parseBody(sendSchema, await request.json())
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { start, end } = monthBounds(new Date(`${parsed.data.month}-01T00:00:00Z`))

  const billing = await getMonthlyBilling(start, end)
  const row = billing.find((b) => b.parentId === parsed.data.parentId)
  if (!row) {
    return NextResponse.json({ error: 'No billable hours found for this family in this period.' }, { status: 400 })
  }

  const outcome = await claimAndSendInvoice(row, start, end)

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.message }, { status: FAILURE_STATUS[outcome.code] })
  }

  recordAudit({
    action: 'billing.invoice.send',
    actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role },
    targetType: 'parent',
    targetId: row.parentId,
    metadata: { amountCents: row.amountCents, hours: row.totalHours, month: parsed.data.month, invoiceId: outcome.invoiceId },
    ...auditContext(request),
  })

  return NextResponse.json({ invoiceId: outcome.invoiceId, hostedUrl: outcome.hostedUrl })
})
