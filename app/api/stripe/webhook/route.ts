import type Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { route } from '@/lib/api-handler'
import { createLogger } from '@/lib/logger'
import { recordEvent } from '@/lib/metrics'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'

const logger = createLogger('stripe/webhook')

// Stripe posts here; there is no session cookie and no user. The signature IS
// the authentication — never process an event before verifying it.
export const dynamic = 'force-dynamic'

/**
 * Invoice lifecycle events we act on, mapped to the local status they set.
 * Anything else Stripe sends is acknowledged and ignored.
 */
const STATUS_BY_EVENT: Record<string, string> = {
  'invoice.paid': 'paid',
  'invoice.payment_succeeded': 'paid',
  'invoice.payment_failed': 'failed',
  'invoice.marked_uncollectible': 'uncollectible',
  'invoice.voided': 'void',
}

/**
 * Stripe webhook receiver.
 *
 * Without this, `Invoice.status` never moves past `sent` — the app can say who
 * was billed but never who paid. Stripe retries failed deliveries and does not
 * guarantee ordering, so this handler is written to be both idempotent and
 * safe against a late event arriving after a newer one.
 */
export const POST = route('stripe/webhook', async (request: Request) => {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripe || !secret) {
    // Misconfiguration, not a bad request. 503 makes Stripe retry later, so
    // events aren't silently lost while the secret is missing.
    logger.error('Webhook received but Stripe is not configured', undefined, {
      hasClient: !!stripe,
      hasSecret: !!secret,
    })
    return NextResponse.json({ error: 'Billing webhook not configured' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // Must be the raw body — any re-serialization breaks the signature.
  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    // Either a forgery or a signing-secret mismatch (test vs live is the usual
    // culprit). 400 tells Stripe not to keep retrying a body we'll never accept.
    logger.error('Webhook signature verification failed', err)
    recordEvent({ category: 'billing', name: 'webhook.invalid_signature', level: 'error', success: false })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const status = STATUS_BY_EVENT[event.type]
  if (!status) {
    // Acknowledge unhandled types so Stripe stops retrying them.
    logger.debug('Ignoring unhandled Stripe event', { type: event.type, eventId: event.id })
    return NextResponse.json({ received: true, handled: false })
  }

  const invoice = event.data.object as Stripe.Invoice
  if (!invoice.id) {
    logger.warn('Invoice event without an invoice id', { type: event.type, eventId: event.id })
    return NextResponse.json({ received: true, handled: false })
  }

  const local = await prisma.invoice.findUnique({ where: { stripeInvoiceId: invoice.id } })
  if (!local) {
    // An invoice created directly in the Stripe Dashboard, or one belonging to
    // another environment pointed at this endpoint. Acknowledge — retrying
    // won't conjure a matching row.
    logger.warn('No local invoice for Stripe event', { type: event.type, stripeInvoiceId: invoice.id })
    return NextResponse.json({ received: true, handled: false })
  }

  // Stripe may deliver out of order and retries duplicates. Two guards:
  //  - the same event applied twice is a no-op
  //  - an event older than the one that last set the status is discarded, so a
  //    delayed payment_failed can't un-pay a paid invoice
  const eventAt = new Date(event.created * 1000)
  if (local.stripeEventId === event.id) {
    return NextResponse.json({ received: true, handled: false, reason: 'duplicate' })
  }
  if (local.statusUpdatedAt && eventAt < local.statusUpdatedAt) {
    logger.warn('Discarding out-of-order Stripe event', {
      type: event.type,
      eventId: event.id,
      invoiceId: local.id,
      eventAt: eventAt.toISOString(),
      lastUpdate: local.statusUpdatedAt.toISOString(),
    })
    return NextResponse.json({ received: true, handled: false, reason: 'stale' })
  }

  const paidAtSeconds = invoice.status_transitions?.paid_at ?? null
  await prisma.invoice.update({
    where: { id: local.id },
    data: {
      status,
      statusUpdatedAt: eventAt,
      stripeEventId: event.id,
      paidAt: status === 'paid' ? (paidAtSeconds ? new Date(paidAtSeconds * 1000) : eventAt) : local.paidAt,
      stripeInvoiceUrl: invoice.hosted_invoice_url ?? local.stripeInvoiceUrl,
      lastError: status === 'failed' ? 'Payment failed — see Stripe for the decline reason.' : null,
    },
  })

  logger.info('Applied Stripe invoice event', {
    type: event.type,
    eventId: event.id,
    invoiceId: local.id,
    parentId: local.parentId,
    status,
  })
  recordEvent({
    category: 'billing',
    name: `webhook.${event.type}`,
    success: status === 'paid',
    level: status === 'paid' ? 'info' : 'warn',
    metadata: { invoiceId: local.id, parentId: local.parentId, amountCents: local.amountCents, status },
  })

  return NextResponse.json({ received: true, handled: true })
})
