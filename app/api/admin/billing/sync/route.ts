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
 * Stripe statuses this route is allowed to write locally, mapped onto the
 * local vocabulary. Deliberately excludes Stripe's `draft`: it means the send
 * never got past creating the invoice, which is exactly what local `failed`
 * already represents. Writing `draft` here would introduce a status the rest
 * of the app doesn't recognize — `claimPeriod`'s takeover conditions
 * (lib/billing-send.ts) and `TERMINAL_STATUSES` both fail to match it, so the
 * period could never be retried OR resynced again, and the admin UI's retry
 * button (which hides once `invoice` is non-null and not `failed`) disappears
 * too. Anything not in this map is left untouched.
 */
const STATUS_MAP: Record<string, string> = {
  open: 'sent',
  paid: 'paid',
  uncollectible: 'uncollectible',
  void: 'void',
}

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

    const localStatus = STATUS_MAP[remote.status]
    if (!localStatus) {
      // `draft` (send never completed) or an unrecognized future Stripe
      // status. Nothing safe to write — leave the local row as-is.
      logger.info('Stripe status not applicable locally; leaving invoice as-is', {
        invoiceId: invoice.id,
        stripeStatus: remote.status,
        localStatus: invoice.status,
      })
      continue
    }
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
