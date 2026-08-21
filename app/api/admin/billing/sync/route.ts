import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/api-auth'
import { route } from '@/lib/api-handler'
import { monthBounds } from '@/lib/billing'
import { BillingNotConfiguredError, fetchInvoiceStatus } from '@/lib/stripe-invoicing'
import { createLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { parseBody } from '@/lib/validations'

const logger = createLogger('admin/billing/sync')

const syncSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
})

/** Local statuses that Stripe can still move. */
const OPEN_STATUSES = ['pending', 'sent', 'failed']

/**
 * Reconcile local invoice status against Stripe.
 *
 * Webhooks are the mechanism for payment tracking; this is the safety net for
 * events missed while the app was redeploying, the signing secret was wrong, or
 * the endpoint was briefly down. Pull-based, so it can't be missed in turn.
 */
export const POST = route('admin/billing/sync', async (request: Request) => {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = parseBody(syncSchema, await request.json())
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { start, end } = monthBounds(new Date(`${parsed.data.month}-01T00:00:00Z`))

  const invoices = await prisma.invoice.findMany({
    where: {
      periodStart: start,
      periodEnd: end,
      status: { in: OPEN_STATUSES },
      stripeInvoiceId: { not: null },
    },
    select: { id: true, stripeInvoiceId: true, status: true, statusUpdatedAt: true },
  })

  let checked = 0
  let updated = 0

  for (const invoice of invoices) {
    checked++
    let remote
    try {
      remote = await fetchInvoiceStatus(invoice.stripeInvoiceId!)
    } catch (err) {
      if (err instanceof BillingNotConfiguredError) {
        return NextResponse.json(
          { error: "Stripe isn't configured yet — add STRIPE_SECRET_KEY to sync invoice status." },
          { status: 400 },
        )
      }
      throw err
    }
    if (!remote) continue

    // Stripe's `open` means finalized and awaiting payment — locally that's
    // `sent`. Everything else maps across directly.
    const localStatus = remote.status === 'open' ? 'sent' : remote.status
    if (localStatus === invoice.status) continue

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: localStatus,
        paidAt: remote.paidAt ?? undefined,
        stripeInvoiceUrl: remote.hostedUrl ?? undefined,
        // Stamp now, not the payment time: this reflects when we learned of it,
        // and keeps a genuinely older webhook from overwriting what we just read.
        statusUpdatedAt: new Date(),
        lastError: localStatus === 'failed' ? 'Payment failed — see Stripe for the decline reason.' : null,
      },
    })
    updated++
    logger.info('Reconciled invoice status from Stripe', {
      invoiceId: invoice.id,
      from: invoice.status,
      to: localStatus,
    })
  }

  return NextResponse.json({ checked, updated })
})
