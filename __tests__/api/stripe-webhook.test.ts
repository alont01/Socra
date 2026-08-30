/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: { invoice: { findUnique: jest.fn(), update: jest.fn() } },
}))
jest.mock('@/lib/stripe', () => ({ getStripe: jest.fn() }))
jest.mock('@/lib/metrics', () => ({ recordEvent: jest.fn() }))

import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { POST } from '@/app/api/stripe/webhook/route'

const p = prisma as unknown as { invoice: { findUnique: jest.Mock; update: jest.Mock } }
const mockGetStripe = getStripe as jest.Mock

const ORIGINAL_SECRET = process.env.STRIPE_WEBHOOK_SECRET

/** Seconds since epoch for a given ISO time. */
const epoch = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

function withStripe(event: unknown, { throws = false } = {}) {
  mockGetStripe.mockReturnValue({
    webhooks: {
      constructEvent: jest.fn(() => {
        if (throws) throw new Error('No signatures found matching the expected signature')
        return event
      }),
    },
  })
}

const req = (body = '{}', signature: string | null = 'sig_test') =>
  new Request('https://socra.test/api/stripe/webhook', {
    method: 'POST',
    headers: signature ? { 'stripe-signature': signature } : {},
    body,
  })

const invoiceEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt_1',
  type: 'invoice.paid',
  created: epoch('2026-08-20T12:00:00Z'),
  data: { object: { id: 'in_123', hosted_invoice_url: 'https://pay', status_transitions: { paid_at: epoch('2026-08-20T11:59:00Z') } } },
  ...overrides,
})

const localInvoice = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv1',
  parentId: 'parent1',
  amountCents: 15000,
  status: 'sent',
  statusUpdatedAt: null,
  stripeEventId: null,
  paidAt: null,
  stripeInvoiceUrl: null,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  p.invoice.update.mockResolvedValue({})
})
afterEach(() => {
  jest.restoreAllMocks()
  if (ORIGINAL_SECRET === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
  else process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_SECRET
})

const call = () => POST(req(), {} as never)

describe('POST /api/stripe/webhook', () => {
  it('rejects a request with no signature header', async () => {
    withStripe(invoiceEvent())
    const res = await POST(req('{}', null), {} as never)
    expect(res.status).toBe(400)
    expect(p.invoice.update).not.toHaveBeenCalled()
  })

  it('rejects a forged or mismatched signature without touching the database', async () => {
    withStripe(invoiceEvent(), { throws: true })
    const res = await call()
    expect(res.status).toBe(400)
    expect(p.invoice.findUnique).not.toHaveBeenCalled()
    expect(p.invoice.update).not.toHaveBeenCalled()
  })

  it('returns 503 when the signing secret is missing, so Stripe retries later', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    withStripe(invoiceEvent())
    // 5xx keeps the event in Stripe's retry queue instead of dropping it.
    expect((await call()).status).toBe(503)
  })

  it('marks the invoice paid', async () => {
    withStripe(invoiceEvent())
    p.invoice.findUnique.mockResolvedValue(localInvoice())

    const res = await call()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, handled: true })
    expect(p.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv1' },
        data: expect.objectContaining({
          status: 'paid',
          stripeEventId: 'evt_1',
          paidAt: new Date(epoch('2026-08-20T11:59:00Z') * 1000),
        }),
      }),
    )
  })

  it('marks a failed payment distinctly from a failed send', async () => {
    // `payment_failed` is its own status, distinct from the local `failed`
    // lib/billing-send.ts writes when OUR send attempt never reached Stripe —
    // conflating them let a bulk re-run "retry" a declined payment by opening
    // a second Stripe invoice for the same hours (see lib/billing-send.ts
    // TERMINAL_STATUSES).
    withStripe(invoiceEvent({ id: 'evt_2', type: 'invoice.payment_failed' }))
    p.invoice.findUnique.mockResolvedValue(localInvoice())

    await call()

    expect(p.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'payment_failed' }) }),
    )
  })

  it('ignores a duplicate delivery of the same event', async () => {
    withStripe(invoiceEvent())
    p.invoice.findUnique.mockResolvedValue(localInvoice({ stripeEventId: 'evt_1', status: 'paid' }))

    const res = await call()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, handled: false, reason: 'duplicate' })
    expect(p.invoice.update).not.toHaveBeenCalled()
  })

  it('discards an out-of-order event that would un-pay a paid invoice', async () => {
    // A payment_failed generated BEFORE the paid event, delivered after it.
    withStripe(
      invoiceEvent({ id: 'evt_old', type: 'invoice.payment_failed', created: epoch('2026-08-20T10:00:00Z') }),
    )
    p.invoice.findUnique.mockResolvedValue(
      localInvoice({ status: 'paid', statusUpdatedAt: new Date('2026-08-20T12:00:00Z') }),
    )

    const res = await call()

    expect(await res.json()).toEqual({ received: true, handled: false, reason: 'stale' })
    expect(p.invoice.update).not.toHaveBeenCalled()
  })

  it('applies a newer event over an older recorded one', async () => {
    withStripe(invoiceEvent({ created: epoch('2026-08-20T14:00:00Z') }))
    p.invoice.findUnique.mockResolvedValue(
      localInvoice({ status: 'sent', statusUpdatedAt: new Date('2026-08-20T12:00:00Z') }),
    )

    await call()

    expect(p.invoice.update).toHaveBeenCalled()
  })

  it('acknowledges an event type it does not handle', async () => {
    withStripe(invoiceEvent({ type: 'customer.created' }))

    const res = await call()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, handled: false })
    expect(p.invoice.findUnique).not.toHaveBeenCalled()
  })

  it('acknowledges an invoice that has no local record', async () => {
    withStripe(invoiceEvent())
    p.invoice.findUnique.mockResolvedValue(null)

    const res = await call()

    // Retrying will never produce a matching row, so do not ask Stripe to.
    expect(res.status).toBe(200)
    expect(p.invoice.update).not.toHaveBeenCalled()
  })
})
