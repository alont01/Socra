import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/api-auth'
import { route } from '@/lib/api-handler'
import { getMonthlyBilling, monthBounds } from '@/lib/billing'
import { claimAndSendInvoice } from '@/lib/billing-send'
import { recordAudit, auditContext } from '@/lib/audit'
import { createLogger } from '@/lib/logger'
import { parseBody } from '@/lib/validations'

const logger = createLogger('admin/billing/send-all')

const sendAllSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
})

/**
 * Stop starting new families past this point and return what was done.
 *
 * Each family costs several sequential Stripe round trips, so a large month
 * could otherwise outlive the platform's request timeout — the admin would see
 * a network error with no idea which families were charged. Every family is
 * committed independently, so returning early is safe and the run is finished
 * by clicking again.
 */
const RUN_BUDGET_MS = 45_000

// POST — invoice every family with billable hours in the month.
//
// Families are processed one at a time, not in parallel: each one performs
// several sequential Stripe writes, and firing them concurrently risks rate
// limits mid-run, which would leave a scattered set of half-sent invoices.
// A monthly run over a handful of families does not need the speed.
export const POST = route(
  'admin/billing/send-all',
  async (request: Request) => {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const parsed = parseBody(sendAllSchema, await request.json())
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { start, end } = monthBounds(new Date(`${parsed.data.month}-01T00:00:00Z`))
    const billing = await getMonthlyBilling(start, end)

    const sent: string[] = []
    const skipped: Array<{ parentId: string; reason: string; message: string }> = []
    const deadline = Date.now() + RUN_BUDGET_MS
    let remaining = 0

    for (const row of billing) {
      if (Date.now() > deadline) {
        remaining = billing.length - sent.length - skipped.length
        logger.warn('Bulk invoice run hit its time budget; stopping early', {
          month: parsed.data.month,
          sent: sent.length,
          remaining,
        })
        break
      }

      // One family's failure must not abort the run — the rest still need
      // invoicing, and each is independently retryable afterwards.
      const outcome = await claimAndSendInvoice(row, start, end)
      if (outcome.ok) {
        sent.push(row.parentId)
        recordAudit({
          action: 'billing.invoice.send',
          actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role },
          targetType: 'parent',
          targetId: row.parentId,
          metadata: {
            amountCents: row.amountCents,
            hours: row.totalHours,
            month: parsed.data.month,
            invoiceId: outcome.invoiceId,
            bulk: true,
          },
          ...auditContext(request),
        })
      } else {
        skipped.push({ parentId: row.parentId, reason: outcome.code, message: outcome.message })
      }
    }

    logger.info('Bulk invoice run complete', {
      month: parsed.data.month,
      families: billing.length,
      sent: sent.length,
      skipped: skipped.length,
      remaining,
    })

    return NextResponse.json({ month: parsed.data.month, total: billing.length, sent, skipped, remaining })
  },
  { errorMessage: 'The bulk invoice run could not be completed. Check the billing page for which families were sent.' },
)
