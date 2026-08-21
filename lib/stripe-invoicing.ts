// Turns a computed ParentBilling (lib/billing.ts) into a real, Stripe-hosted
// invoice.
//
// Two ordering decisions here exist purely to prevent double-billing, and both
// are the opposite of the obvious approach:
//
//  1. The draft invoice is created BEFORE its line items, and every item is
//     attached to that draft. An item created without an invoice belongs to the
//     customer, so a failure partway through leaves orphans that Stripe
//     silently sweeps onto the family's NEXT invoice — charging them twice for
//     the same hours.
//
//  2. A retry RESUMES the existing Stripe invoice rather than creating a new
//     one. The caller persists the draft id the moment it exists, so even a
//     retry days later (past Stripe's 24h idempotency window) picks up where it
//     left off instead of starting a second invoice.
//
// Concurrency between two admins clicking at once is arbitrated upstream by the
// local Invoice row's unique constraint — see lib/billing-send.ts.

import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { config } from '@/lib/config'
import { createLogger } from '@/lib/logger'
import type { ParentBilling } from '@/lib/billing'

const logger = createLogger('stripe-invoicing')

export class BillingNotConfiguredError extends Error {
  constructor() {
    super('Stripe is not configured (STRIPE_SECRET_KEY is unset).')
    this.name = 'BillingNotConfiguredError'
  }
}

/**
 * Stable key for one family's invoice for one period. Stripe deduplicates
 * retries carrying the same key for 24 hours, which covers double-clicks and
 * automatic retries; the persisted draft id (above) covers everything longer.
 */
function idempotencyKey(parentId: string, periodStart: Date, suffix: string): string {
  return `inv:${parentId}:${periodStart.toISOString().slice(0, 10)}:${suffix}`
}

async function getOrCreateStripeCustomerId(parentId: string): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new BillingNotConfiguredError()

  const parent = await prisma.parentProfile.findUniqueOrThrow({
    where: { id: parentId },
    select: { id: true, name: true, stripeCustomerId: true, user: { select: { email: true } } },
  })
  if (parent.stripeCustomerId) return parent.stripeCustomerId

  const customer = await stripe.customers.create(
    { email: parent.user.email, name: parent.name, metadata: { parentId } },
    // Keyed on the parent so a retry after a timeout reuses the same customer
    // instead of creating a duplicate that splits their billing history.
    { idempotencyKey: `cus:${parentId}` },
  )
  await prisma.parentProfile.update({ where: { id: parentId }, data: { stripeCustomerId: customer.id } })
  return customer.id
}

export interface SentInvoice {
  stripeInvoiceId: string
  hostedUrl: string | null
  status: string
}

export interface SendInvoiceOptions {
  /** Resume this invoice instead of creating one (set on a retry). */
  existingStripeInvoiceId?: string | null
  /**
   * Called with the draft id the instant it exists, before any further Stripe
   * call can fail. The caller persists it so a later retry can resume.
   */
  onInvoiceCreated?: (stripeInvoiceId: string) => Promise<void>
}

/**
 * Create (or resume), finalize, and email one family's invoice for a period.
 *
 * Does NOT write the local Invoice row — the caller owns that, having already
 * claimed the period. Throws BillingNotConfiguredError when Stripe isn't set
 * up, or the underlying Stripe error on any API failure.
 */
export async function sendMonthlyInvoice(
  billing: ParentBilling,
  periodStart: Date,
  periodEnd: Date,
  options: SendInvoiceOptions = {},
): Promise<SentInvoice> {
  const stripe = getStripe()
  if (!stripe) throw new BillingNotConfiguredError()

  const customerId = await getOrCreateStripeCustomerId(billing.parentId)
  const periodLabel = periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  const invoiceId = options.existingStripeInvoiceId
    ? options.existingStripeInvoiceId
    : await createDraft(stripe, billing, periodStart, periodEnd, customerId, periodLabel, options)

  // Always read the live state. On an idempotent replay Stripe returns the
  // ORIGINAL response body, so `draft.status` would be stale — and on a resume
  // the invoice may already be finalized, sent, or even paid.
  let invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['lines'] })

  // Already settled — never re-send. Charging again because a retry ran twice
  // is exactly the failure this module exists to prevent.
  if (invoice.status === 'paid' || invoice.status === 'void' || invoice.status === 'uncollectible') {
    logger.warn('Invoice already settled; not re-sending', {
      parentId: billing.parentId,
      stripeInvoiceId: invoiceId,
      status: invoice.status,
    })
    return { stripeInvoiceId: invoiceId, hostedUrl: invoice.hosted_invoice_url ?? null, status: invoice.status ?? 'unknown' }
  }

  if (invoice.status === 'draft') {
    // Only add lines to an empty draft. A resumed draft already has them, and
    // adding a second set would double the amount.
    if ((invoice.lines?.data.length ?? 0) === 0) {
      for (const child of billing.children) {
        await stripe.invoiceItems.create(
          {
            customer: customerId,
            invoice: invoiceId,
            currency: config.billing.currency,
            amount: Math.round(child.hours * billing.rateUsd * 100),
            description: `Tutoring — ${child.studentName} (${child.hours} hr${child.hours === 1 ? '' : 's'} @ $${billing.rateUsd}/hr) — ${periodLabel}`,
          },
          { idempotencyKey: idempotencyKey(billing.parentId, periodStart, `item:${child.studentId}`) },
        )
      }
    }
    invoice = await stripe.invoices.finalizeInvoice(invoiceId)
  }

  if (invoice.status === 'open') {
    await stripe.invoices.sendInvoice(invoiceId)
  }

  logger.info('Sent monthly invoice', {
    parentId: billing.parentId,
    stripeInvoiceId: invoiceId,
    amountCents: billing.amountCents,
    status: invoice.status,
  })

  return {
    stripeInvoiceId: invoiceId,
    hostedUrl: invoice.hosted_invoice_url ?? null,
    status: invoice.status ?? 'open',
  }
}

async function createDraft(
  stripe: Stripe,
  billing: ParentBilling,
  periodStart: Date,
  periodEnd: Date,
  customerId: string,
  periodLabel: string,
  options: SendInvoiceOptions,
): Promise<string> {
  const draft = await stripe.invoices.create(
    {
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: config.billing.invoiceDueDays,
      auto_advance: false, // finalized + sent explicitly, below
      // Never absorb stray pending items left behind by an earlier attempt.
      pending_invoice_items_behavior: 'exclude',
      description: `Tutoring — ${periodLabel}`,
      metadata: {
        parentId: billing.parentId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
    },
    { idempotencyKey: idempotencyKey(billing.parentId, periodStart, 'invoice') },
  )

  if (!draft.id) throw new Error('Stripe returned an invoice without an id')

  // Persist before anything else can fail, so a retry resumes this invoice
  // rather than opening a second one.
  await options.onInvoiceCreated?.(draft.id)

  return draft.id
}

/** Current Stripe status for an invoice, for the admin reconcile action. */
export async function fetchInvoiceStatus(
  stripeInvoiceId: string,
): Promise<{ status: string; hostedUrl: string | null; paidAt: Date | null } | null> {
  const stripe = getStripe()
  if (!stripe) throw new BillingNotConfiguredError()

  try {
    const invoice = await stripe.invoices.retrieve(stripeInvoiceId)
    const paidAtSeconds = invoice.status_transitions?.paid_at ?? null
    return {
      status: invoice.status ?? 'unknown',
      hostedUrl: invoice.hosted_invoice_url ?? null,
      paidAt: paidAtSeconds ? new Date(paidAtSeconds * 1000) : null,
    }
  } catch (err) {
    logger.warn('Could not fetch invoice status from Stripe', {
      stripeInvoiceId,
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
