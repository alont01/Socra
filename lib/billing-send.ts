// Orchestrates "send one family's invoice": claim the period locally, call
// Stripe, record the outcome. Shared by the single-send and send-all routes.
//
// The claim comes FIRST and is the whole point. Previously the local Invoice
// row was written only after Stripe succeeded, which meant two concurrent
// clicks both saw "not yet invoiced" and both charged the family, and a retry
// after a partial failure looked equally clean. Inserting the row up front
// makes the @@unique([parentId, periodStart, periodEnd]) index the arbiter —
// the same first-wins pattern used for tutor match offers.
//
// Every status write is conditional on the row still being `pending`, because
// a webhook can land mid-send (the parent pays the moment the email arrives)
// and an unconditional write would clobber `paid` back to `sent`.

import { prisma } from '@/lib/prisma'
import { createLogger } from '@/lib/logger'
import { recordEvent } from '@/lib/metrics'
import type { ParentBilling } from '@/lib/billing'
import { BillingNotConfiguredError, sendMonthlyInvoice } from '@/lib/stripe-invoicing'

const logger = createLogger('billing-send')

export type SendOutcome =
  | { ok: true; invoiceId: string; stripeInvoiceId: string; hostedUrl: string | null }
  | { ok: false; code: SendFailureCode; message: string }

export type SendFailureCode =
  | 'already_invoiced'
  | 'no_billable_hours'
  | 'not_configured'
  | 'stripe_failed'

/**
 * How long a `pending` claim is respected before another attempt may take it
 * over. A send makes a handful of Stripe calls, so anything still pending after
 * this had its process die mid-flight; without a takeover window that period
 * could never be invoiced again without manual DB surgery.
 */
const PENDING_TAKEOVER_MS = 10 * 60_000

/**
 * Statuses that mean "don't touch this period again through claimPeriod".
 *
 * Most of these mean settled (paid/void/uncollectible) or already delivered
 * (sent). `payment_failed` isn't settled — the Stripe invoice is still open
 * and may yet be paid or written off — but it must be just as untouchable
 * here: the invoice already reached the family, so claiming this row for a
 * fresh send would create a SECOND Stripe invoice for the same hours instead
 * of resuming the one that's just awaiting payment. It is not in the OR list
 * `claimPeriod` reclaims a row on below, so this is defense in depth for that
 * intent rather than the primary guard.
 */
const TERMINAL_STATUSES = new Set(['sent', 'paid', 'void', 'uncollectible', 'payment_failed'])

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === 'P2002'
}

/**
 * Take exclusive ownership of the (parent, period) slot.
 *
 * Returns the row to work with, or null when someone else owns it or it's
 * already settled. The takeover is a conditional `updateMany`, so two
 * concurrent callers cannot both win: the second re-evaluates its WHERE against
 * the row the first just changed and matches nothing.
 */
async function claimPeriod(
  billing: ParentBilling,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ id: string; stripeInvoiceId: string | null } | null> {
  const now = new Date()

  try {
    const created = await prisma.invoice.create({
      data: {
        parentId: billing.parentId,
        periodStart,
        periodEnd,
        hours: billing.totalHours,
        rateUsd: billing.rateUsd,
        amountCents: billing.amountCents,
        status: 'pending',
        statusUpdatedAt: now,
      },
    })
    return { id: created.id, stripeInvoiceId: created.stripeInvoiceId }
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
  }

  // A row already exists. Take it over only if it's an explicit retry of a
  // failed send, or a pending claim abandoned long enough to be dead.
  const staleCutoff = new Date(now.getTime() - PENDING_TAKEOVER_MS)
  const takeover = await prisma.invoice.updateMany({
    where: {
      parentId: billing.parentId,
      periodStart,
      periodEnd,
      OR: [
        { status: 'failed' },
        { status: 'pending', statusUpdatedAt: { lt: staleCutoff } },
        // Rows written before statusUpdatedAt existed.
        { status: 'pending', statusUpdatedAt: null },
      ],
    },
    data: {
      status: 'pending',
      statusUpdatedAt: now,
      // Refresh the figures — hours can change between attempts (a sweeper may
      // have closed a session since).
      hours: billing.totalHours,
      rateUsd: billing.rateUsd,
      amountCents: billing.amountCents,
      lastError: null,
    },
  })

  if (takeover.count === 0) return null

  const existing = await prisma.invoice.findUnique({
    where: { parentId_periodStart_periodEnd: { parentId: billing.parentId, periodStart, periodEnd } },
    select: { id: true, stripeInvoiceId: true, status: true },
  })
  // Re-check: between the takeover and this read the row could have been
  // settled by a webhook.
  if (!existing || TERMINAL_STATUSES.has(existing.status)) return null

  return { id: existing.id, stripeInvoiceId: existing.stripeInvoiceId }
}

/**
 * Send one family's invoice for a period, exactly once.
 *
 * Never throws for an expected condition — those come back as `ok: false` so a
 * bulk run can continue past one family. Unexpected errors still throw.
 */
export async function claimAndSendInvoice(
  billing: ParentBilling,
  periodStart: Date,
  periodEnd: Date,
): Promise<SendOutcome> {
  if (billing.amountCents <= 0) {
    return { ok: false, code: 'no_billable_hours', message: 'No billable hours for this family in this period.' }
  }

  const claim = await claimPeriod(billing, periodStart, periodEnd)
  if (!claim) {
    return { ok: false, code: 'already_invoiced', message: 'This family has already been invoiced for this period.' }
  }

  try {
    const sent = await sendMonthlyInvoice(billing, periodStart, periodEnd, {
      existingStripeInvoiceId: claim.stripeInvoiceId,
      // Persist the Stripe id the moment it exists so a retry resumes this
      // invoice instead of opening a second one.
      onInvoiceCreated: async (stripeInvoiceId) => {
        await prisma.invoice.update({ where: { id: claim.id }, data: { stripeInvoiceId } })
      },
    })

    await recordSent(claim.id, sent)

    recordEvent({
      category: 'billing',
      name: 'invoice.sent',
      success: true,
      metadata: {
        parentId: billing.parentId,
        invoiceId: claim.id,
        amountCents: billing.amountCents,
        hours: billing.totalHours,
      },
    })

    return { ok: true, invoiceId: claim.id, stripeInvoiceId: sent.stripeInvoiceId, hostedUrl: sent.hostedUrl }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Mark the claim failed rather than deleting it: the row may already carry
    // a Stripe invoice id, and that is the only pointer back to a draft that
    // must be resumed rather than duplicated. A failed row is retryable.
    //
    // Conditional on `pending` so this can't overwrite a status a webhook set
    // while the send was in flight.
    await prisma.invoice
      .updateMany({
        where: { id: claim.id, status: 'pending' },
        data: { status: 'failed', statusUpdatedAt: new Date(), lastError: message.slice(0, 500) },
      })
      .catch((updateErr) => {
        logger.error('Could not mark invoice failed', updateErr, { invoiceId: claim.id })
      })

    recordEvent({
      category: 'billing',
      name: 'invoice.send_failed',
      level: 'error',
      success: false,
      metadata: { parentId: billing.parentId, invoiceId: claim.id, error: message },
    })

    if (err instanceof BillingNotConfiguredError) {
      return { ok: false, code: 'not_configured', message: "Stripe isn't configured yet — add STRIPE_SECRET_KEY to send invoices." }
    }

    logger.error('Invoice send failed', err, { parentId: billing.parentId, invoiceId: claim.id })
    return { ok: false, code: 'stripe_failed', message: 'Could not send the invoice. It has been marked failed and can be retried.' }
  }
}

/**
 * Record a successful send.
 *
 * A parent can pay the instant the email lands, so the `invoice.paid` webhook
 * may already have marked this row before we get here. Advancing `pending` is
 * conditional for exactly that reason; a Stripe-confirmed `paid` is
 * authoritative and written unconditionally.
 */
async function recordSent(
  invoiceId: string,
  sent: { stripeInvoiceId: string; hostedUrl: string | null; status: string },
): Promise<void> {
  const now = new Date()
  const shared = {
    stripeInvoiceId: sent.stripeInvoiceId,
    stripeInvoiceUrl: sent.hostedUrl,
    sentAt: now,
    statusUpdatedAt: now,
    lastError: null,
  }

  if (sent.status === 'paid') {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { ...shared, status: 'paid', paidAt: now } })
    return
  }

  const advanced = await prisma.invoice.updateMany({
    where: { id: invoiceId, status: 'pending' },
    data: { ...shared, status: 'sent' },
  })

  if (advanced.count === 0) {
    // Not an error: the webhook got there first and knows more than we do.
    logger.info('Invoice status already advanced by a webhook; leaving it as-is', { invoiceId })
  }
}
