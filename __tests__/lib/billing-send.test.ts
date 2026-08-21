/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    invoice: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  },
}))
jest.mock('@/lib/stripe-invoicing', () => {
  const actual = jest.requireActual('@/lib/stripe-invoicing')
  return { ...actual, sendMonthlyInvoice: jest.fn() }
})
jest.mock('@/lib/metrics', () => ({ recordEvent: jest.fn() }))

import { prisma } from '@/lib/prisma'
import { BillingNotConfiguredError, sendMonthlyInvoice } from '@/lib/stripe-invoicing'
import { claimAndSendInvoice } from '@/lib/billing-send'
import type { ParentBilling } from '@/lib/billing'

const p = prisma as unknown as {
  invoice: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock }
}
const mockSend = sendMonthlyInvoice as jest.Mock

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

/** A Prisma unique-constraint violation. */
const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  p.invoice.update.mockResolvedValue({})
  p.invoice.updateMany.mockResolvedValue({ count: 1 })
  mockSend.mockResolvedValue({ stripeInvoiceId: 'in_123', hostedUrl: 'https://pay/1', status: 'open' })
})
afterEach(() => jest.restoreAllMocks())

const send = () => claimAndSendInvoice(billing, periodStart, periodEnd)

describe('claimAndSendInvoice', () => {
  it('claims the period before calling Stripe', async () => {
    p.invoice.create.mockResolvedValue({ id: 'inv1', stripeInvoiceId: null })

    const result = await send()

    expect(result).toEqual({ ok: true, invoiceId: 'inv1', stripeInvoiceId: 'in_123', hostedUrl: 'https://pay/1' })
    // The local claim must exist before any money moves — ordering is the whole
    // point of the claim, so assert it rather than just that both ran.
    expect(p.invoice.create.mock.invocationCallOrder[0]).toBeLessThan(mockSend.mock.invocationCallOrder[0])
    expect(p.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parentId: 'parent1', status: 'pending' }) }),
    )
  })

  it('marks the invoice sent on success', async () => {
    p.invoice.create.mockResolvedValue({ id: 'inv1', stripeInvoiceId: null })
    await send()
    expect(p.invoice.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        // Guarded on `pending` so a webhook that already marked this paid wins.
        where: { id: 'inv1', status: 'pending' },
        data: expect.objectContaining({ status: 'sent', stripeInvoiceId: 'in_123', lastError: null }),
      }),
    )
  })

  it('leaves the status alone when a webhook advanced it mid-send', async () => {
    p.invoice.create.mockResolvedValue({ id: 'inv1', stripeInvoiceId: null })
    // The conditional write matches nothing: the row is no longer `pending`.
    p.invoice.updateMany.mockResolvedValue({ count: 0 })

    const result = await send()

    // Still a successful send — the invoice went out; the webhook simply knows
    // more about it than we do.
    expect(result.ok).toBe(true)
  })

  it('refuses a second send when the period is already invoiced', async () => {
    p.invoice.create.mockRejectedValue(p2002)
    // The conditional takeover matches nothing — the row is `sent`.
    p.invoice.updateMany.mockResolvedValue({ count: 0 })

    const result = await send()

    expect(result).toEqual({ ok: false, code: 'already_invoiced', message: expect.any(String) })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('does not take over a pending claim another request still holds', async () => {
    p.invoice.create.mockRejectedValue(p2002)
    p.invoice.updateMany.mockResolvedValue({ count: 0 })

    const result = await send()

    // Two admins clicking at once must not both charge the family.
    expect(result).toMatchObject({ ok: false, code: 'already_invoiced' })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('only takes over a failed row or a long-abandoned pending one', async () => {
    p.invoice.create.mockRejectedValue(p2002)
    p.invoice.updateMany.mockResolvedValue({ count: 1 })
    p.invoice.findUnique.mockResolvedValue({ id: 'inv1', status: 'pending', stripeInvoiceId: null })

    await send()

    const where = p.invoice.updateMany.mock.calls[0][0].where
    expect(where.OR).toEqual([
      { status: 'failed' },
      { status: 'pending', statusUpdatedAt: { lt: expect.any(Date) } },
      { status: 'pending', statusUpdatedAt: null },
    ])
  })

  it('abandons the send if the row was settled between takeover and read', async () => {
    p.invoice.create.mockRejectedValue(p2002)
    p.invoice.updateMany.mockResolvedValue({ count: 1 })
    p.invoice.findUnique.mockResolvedValue({ id: 'inv1', status: 'paid', stripeInvoiceId: 'in_123' })

    expect((await send()).ok).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('retries a previously failed period, resuming the same Stripe invoice', async () => {
    p.invoice.create.mockRejectedValue(p2002)
    p.invoice.updateMany.mockResolvedValue({ count: 1 })
    p.invoice.findUnique.mockResolvedValue({ id: 'inv1', status: 'failed', stripeInvoiceId: 'in_partial' })

    const result = await send()

    expect(result.ok).toBe(true)
    // Resuming (not creating a second invoice) is what prevents double billing.
    expect(mockSend).toHaveBeenCalledWith(
      billing,
      periodStart,
      periodEnd,
      expect.objectContaining({ existingStripeInvoiceId: 'in_partial' }),
    )
  })

  it('persists the Stripe invoice id as soon as the draft exists', async () => {
    p.invoice.create.mockResolvedValue({ id: 'inv1', stripeInvoiceId: null })
    mockSend.mockImplementation(async (_b, _s, _e, options) => {
      await options.onInvoiceCreated('in_draft')
      return { stripeInvoiceId: 'in_draft', hostedUrl: null, status: 'open' }
    })

    await send()

    // Written before the send completes, so a crash mid-flight still leaves a
    // pointer back to the draft.
    expect(p.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv1' }, data: { stripeInvoiceId: 'in_draft' } })
  })

  it('marks the row failed (not deleted) when Stripe throws', async () => {
    p.invoice.create.mockResolvedValue({ id: 'inv1', stripeInvoiceId: null })
    mockSend.mockRejectedValue(new Error('card_declined: network blip'))

    const result = await send()

    expect(result).toEqual({ ok: false, code: 'stripe_failed', message: expect.any(String) })
    expect(p.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Guarded, so a failure can't clobber a paid status set by a webhook.
        where: { id: 'inv1', status: 'pending' },
        data: expect.objectContaining({ status: 'failed', lastError: expect.stringContaining('card_declined') }),
      }),
    )
  })

  it('reports a missing Stripe configuration distinctly', async () => {
    p.invoice.create.mockResolvedValue({ id: 'inv1', stripeInvoiceId: null })
    mockSend.mockRejectedValue(new BillingNotConfiguredError())

    const result = await send()
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ code: 'not_configured' })
  })

  it('records the paid status when a resumed invoice was already paid', async () => {
    p.invoice.create.mockResolvedValue({ id: 'inv1', stripeInvoiceId: null })
    mockSend.mockResolvedValue({ stripeInvoiceId: 'in_123', hostedUrl: null, status: 'paid' })

    await send()

    // A Stripe-confirmed paid is authoritative — written unconditionally.
    expect(p.invoice.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'paid', paidAt: expect.any(Date) }) }),
    )
  })

  it('never charges a family with no billable hours', async () => {
    const empty = { ...billing, totalHours: 0, amountCents: 0, children: [] }
    const result = await claimAndSendInvoice(empty, periodStart, periodEnd)

    expect(result).toEqual({ ok: false, code: 'no_billable_hours', message: expect.any(String) })
    expect(p.invoice.create).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })
})
