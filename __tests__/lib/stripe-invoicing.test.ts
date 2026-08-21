/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    parentProfile: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    invoice: { create: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/stripe', () => ({ getStripe: jest.fn() }))

import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { sendMonthlyInvoice, fetchInvoiceStatus, BillingNotConfiguredError } from '@/lib/stripe-invoicing'
import type { ParentBilling } from '@/lib/billing'

const p = prisma as unknown as {
  parentProfile: { findUniqueOrThrow: jest.Mock; update: jest.Mock }
  invoice: { create: jest.Mock; update: jest.Mock }
}
const mockGetStripe = getStripe as jest.Mock

const billing: ParentBilling = {
  parentId: 'parent1',
  parentName: 'Jane Parent',
  parentEmail: 'jane@example.com',
  children: [{ studentId: 's1', studentName: 'Maya', hours: 2 }],
  totalHours: 2,
  rateUsd: 75,
  amountCents: 15000,
  autoClosedSessions: 0,
}
const periodStart = new Date('2026-08-01T00:00:00Z')
const periodEnd = new Date('2026-09-01T00:00:00Z')

/**
 * A Stripe double. `retrieveStatus` controls what the live re-read reports,
 * which is what drives the resume logic.
 */
function stripeDouble(overrides: {
  retrieve?: unknown
  finalizeStatus?: string
  createId?: string | null
} = {}) {
  const retrieved = overrides.retrieve ?? { id: 'in_draft', status: 'draft', lines: { data: [] }, hosted_invoice_url: null }
  return {
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_new' }) },
    invoiceItems: { create: jest.fn().mockResolvedValue({}) },
    invoices: {
      create: jest.fn().mockResolvedValue({ id: overrides.createId === undefined ? 'in_draft' : overrides.createId }),
      retrieve: jest.fn().mockResolvedValue(retrieved),
      finalizeInvoice: jest.fn().mockResolvedValue({
        id: 'in_draft',
        status: overrides.finalizeStatus ?? 'open',
        hosted_invoice_url: 'https://stripe.test/inv',
      }),
      sendInvoice: jest.fn().mockResolvedValue({}),
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  p.parentProfile.findUniqueOrThrow.mockResolvedValue({
    id: 'parent1', name: 'Jane Parent', stripeCustomerId: 'cus_existing', user: { email: 'jane@example.com' },
  })
})
afterEach(() => jest.restoreAllMocks())

describe('sendMonthlyInvoice', () => {
  it('throws BillingNotConfiguredError when Stripe is not set up', async () => {
    mockGetStripe.mockReturnValue(null)
    await expect(sendMonthlyInvoice(billing, periodStart, periodEnd)).rejects.toThrow(BillingNotConfiguredError)
  })

  it('creates the invoice BEFORE its line items, and attaches them to it', async () => {
    const stripe = stripeDouble()
    mockGetStripe.mockReturnValue(stripe)

    await sendMonthlyInvoice(billing, periodStart, periodEnd)

    // Ordering is the double-billing fix: an item created before the invoice
    // exists would be a pending item on the customer, swept onto their NEXT
    // invoice if this attempt failed.
    expect(stripe.invoices.create.mock.invocationCallOrder[0]).toBeLessThan(
      stripe.invoiceItems.create.mock.invocationCallOrder[0],
    )
    expect(stripe.invoiceItems.create).toHaveBeenCalledWith(
      expect.objectContaining({ invoice: 'in_draft', customer: 'cus_existing', amount: 15000 }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
  })

  it('excludes stray pending invoice items from the new invoice', async () => {
    const stripe = stripeDouble()
    mockGetStripe.mockReturnValue(stripe)

    await sendMonthlyInvoice(billing, periodStart, periodEnd)

    expect(stripe.invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({ pending_invoice_items_behavior: 'exclude' }),
      expect.anything(),
    )
  })

  it('sends an idempotency key with every create call', async () => {
    const stripe = stripeDouble()
    mockGetStripe.mockReturnValue(stripe)

    await sendMonthlyInvoice(billing, periodStart, periodEnd)

    for (const call of [stripe.invoices.create.mock.calls[0], stripe.invoiceItems.create.mock.calls[0]]) {
      expect(call[1]).toEqual(expect.objectContaining({ idempotencyKey: expect.stringContaining('parent1') }))
    }
  })

  it('reports the draft id the moment it exists', async () => {
    const stripe = stripeDouble()
    mockGetStripe.mockReturnValue(stripe)
    const onInvoiceCreated = jest.fn()

    await sendMonthlyInvoice(billing, periodStart, periodEnd, { onInvoiceCreated })

    expect(onInvoiceCreated).toHaveBeenCalledWith('in_draft')
    // Before finalize, so a crash still leaves a resumable pointer.
    expect(onInvoiceCreated.mock.invocationCallOrder[0]).toBeLessThan(
      stripe.invoices.finalizeInvoice.mock.invocationCallOrder[0],
    )
  })

  it('resumes an existing invoice rather than creating a second one', async () => {
    const stripe = stripeDouble()
    mockGetStripe.mockReturnValue(stripe)

    await sendMonthlyInvoice(billing, periodStart, periodEnd, { existingStripeInvoiceId: 'in_partial' })

    expect(stripe.invoices.create).not.toHaveBeenCalled()
    expect(stripe.invoices.retrieve).toHaveBeenCalledWith('in_partial', expect.anything())
  })

  it('does not re-add line items to a resumed draft that already has them', async () => {
    const stripe = stripeDouble({
      retrieve: { id: 'in_partial', status: 'draft', lines: { data: [{ id: 'il_1' }] }, hosted_invoice_url: null },
    })
    mockGetStripe.mockReturnValue(stripe)

    await sendMonthlyInvoice(billing, periodStart, periodEnd, { existingStripeInvoiceId: 'in_partial' })

    // Adding a second set of lines would double the family's bill.
    expect(stripe.invoiceItems.create).not.toHaveBeenCalled()
    expect(stripe.invoices.finalizeInvoice).toHaveBeenCalledWith('in_partial')
  })

  it('skips finalize for an invoice already finalized, and just sends it', async () => {
    const stripe = stripeDouble({
      retrieve: { id: 'in_open', status: 'open', lines: { data: [{ id: 'il_1' }] }, hosted_invoice_url: 'https://pay' },
    })
    mockGetStripe.mockReturnValue(stripe)

    await sendMonthlyInvoice(billing, periodStart, periodEnd, { existingStripeInvoiceId: 'in_open' })

    expect(stripe.invoices.finalizeInvoice).not.toHaveBeenCalled()
    expect(stripe.invoices.sendInvoice).toHaveBeenCalledWith('in_open')
  })

  it('never re-sends an invoice the family already paid', async () => {
    const stripe = stripeDouble({
      retrieve: { id: 'in_paid', status: 'paid', lines: { data: [] }, hosted_invoice_url: 'https://pay' },
    })
    mockGetStripe.mockReturnValue(stripe)

    const result = await sendMonthlyInvoice(billing, periodStart, periodEnd, { existingStripeInvoiceId: 'in_paid' })

    expect(stripe.invoiceItems.create).not.toHaveBeenCalled()
    expect(stripe.invoices.finalizeInvoice).not.toHaveBeenCalled()
    expect(stripe.invoices.sendInvoice).not.toHaveBeenCalled()
    expect(result.status).toBe('paid')
  })

  it('does not touch a voided invoice', async () => {
    const stripe = stripeDouble({
      retrieve: { id: 'in_void', status: 'void', lines: { data: [] }, hosted_invoice_url: null },
    })
    mockGetStripe.mockReturnValue(stripe)

    const result = await sendMonthlyInvoice(billing, periodStart, periodEnd, { existingStripeInvoiceId: 'in_void' })

    expect(stripe.invoices.sendInvoice).not.toHaveBeenCalled()
    expect(result.status).toBe('void')
  })

  it('creates a Stripe customer when the parent has none yet', async () => {
    p.parentProfile.findUniqueOrThrow.mockResolvedValue({
      id: 'parent1', name: 'Jane Parent', stripeCustomerId: null, user: { email: 'jane@example.com' },
    })
    const stripe = stripeDouble()
    mockGetStripe.mockReturnValue(stripe)

    await sendMonthlyInvoice(billing, periodStart, periodEnd)

    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@example.com', name: 'Jane Parent' }),
      expect.objectContaining({ idempotencyKey: 'cus:parent1' }),
    )
    expect(p.parentProfile.update).toHaveBeenCalledWith({
      where: { id: 'parent1' },
      data: { stripeCustomerId: 'cus_new' },
    })
  })

  it('propagates a Stripe failure and never sends', async () => {
    const stripe = stripeDouble()
    stripe.invoices.finalizeInvoice.mockRejectedValue(new Error('Stripe API down'))
    mockGetStripe.mockReturnValue(stripe)

    await expect(sendMonthlyInvoice(billing, periodStart, periodEnd)).rejects.toThrow('Stripe API down')
    expect(stripe.invoices.sendInvoice).not.toHaveBeenCalled()
  })

  it('throws when Stripe returns an invoice without an id', async () => {
    const stripe = stripeDouble({ createId: null })
    mockGetStripe.mockReturnValue(stripe)

    await expect(sendMonthlyInvoice(billing, periodStart, periodEnd)).rejects.toThrow(/without an id/)
  })
})

describe('fetchInvoiceStatus', () => {
  it('maps a paid invoice, converting the Stripe timestamp', async () => {
    const paidAt = 1_760_000_000
    mockGetStripe.mockReturnValue({
      invoices: {
        retrieve: jest.fn().mockResolvedValue({
          status: 'paid',
          hosted_invoice_url: 'https://pay',
          status_transitions: { paid_at: paidAt },
        }),
      },
    })

    const result = await fetchInvoiceStatus('in_123')

    expect(result).toEqual({ status: 'paid', hostedUrl: 'https://pay', paidAt: new Date(paidAt * 1000) })
  })

  it('returns null rather than throwing when Stripe errors', async () => {
    mockGetStripe.mockReturnValue({
      invoices: { retrieve: jest.fn().mockRejectedValue(new Error('no such invoice')) },
    })

    expect(await fetchInvoiceStatus('in_missing')).toBeNull()
  })
})
