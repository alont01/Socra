// Turns a computed ParentBilling (lib/billing.ts) into a real, Stripe-hosted
// invoice: get-or-create the Stripe Customer, add one line item per child,
// finalize + email the invoice, then record it locally. The local Invoice row
// is only written after Stripe confirms success, so a failed/partial attempt
// leaves nothing to clean up — the admin can just retry.

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

async function getOrCreateStripeCustomerId(parentId: string): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new BillingNotConfiguredError()

  const parent = await prisma.parentProfile.findUniqueOrThrow({
    where: { id: parentId },
    select: { id: true, name: true, stripeCustomerId: true, user: { select: { email: true } } },
  })
  if (parent.stripeCustomerId) return parent.stripeCustomerId

  const customer = await stripe.customers.create({ email: parent.user.email, name: parent.name })
  await prisma.parentProfile.update({ where: { id: parentId }, data: { stripeCustomerId: customer.id } })
  return customer.id
}

/**
 * Create, finalize, and email a Stripe invoice for one family's billing
 * period, then record it locally. Throws BillingNotConfiguredError if Stripe
 * isn't set up yet; throws on any Stripe API failure (caller reports it —
 * nothing partial is left in the local Invoice table).
 */
export async function sendMonthlyInvoice(
  billing: ParentBilling,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ id: string; hostedUrl: string | null }> {
  const stripe = getStripe()
  if (!stripe) throw new BillingNotConfiguredError()

  const customerId = await getOrCreateStripeCustomerId(billing.parentId)
  const periodLabel = periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  for (const child of billing.children) {
    await stripe.invoiceItems.create({
      customer: customerId,
      currency: config.billing.currency,
      amount: Math.round(child.hours * billing.rateUsd * 100),
      description: `Tutoring — ${child.studentName} (${child.hours} hr${child.hours === 1 ? '' : 's'} @ $${billing.rateUsd}/hr) — ${periodLabel}`,
    })
  }

  const draft = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: 14,
    auto_advance: false, // we finalize + send explicitly, below
  })

  const finalized = await stripe.invoices.finalizeInvoice(draft.id!)
  await stripe.invoices.sendInvoice(finalized.id!)

  const record = await prisma.invoice.create({
    data: {
      parentId: billing.parentId,
      periodStart,
      periodEnd,
      hours: billing.totalHours,
      rateUsd: billing.rateUsd,
      amountCents: billing.amountCents,
      stripeInvoiceId: finalized.id!,
      stripeInvoiceUrl: finalized.hosted_invoice_url ?? null,
      status: 'sent',
      sentAt: new Date(),
    },
  })

  logger.info('Sent monthly invoice', { parentId: billing.parentId, invoiceId: record.id, amountCents: billing.amountCents })
  return { id: record.id, hostedUrl: record.stripeInvoiceUrl }
}
