/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    parentProfile: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    invoice: { create: jest.fn() },
  },
}))
jest.mock('@/lib/stripe', () => ({ getStripe: jest.fn() }))

import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { sendMonthlyInvoice, BillingNotConfiguredError } from '@/lib/stripe-invoicing'
import type { ParentBilling } from '@/lib/billing'

const p = prisma as unknown as {
  parentProfile: { findUniqueOrThrow: jest.Mock; update: jest.Mock }
  invoice: { create: jest.Mock }
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
}
const periodStart = new Date('2026-08-01T00:00:00Z')
const periodEnd = new Date('2026-09-01T00:00:00Z')

beforeEach(() => {
  jest.clearAllMocks()
  p.parentProfile.findUniqueOrThrow.mockResolvedValue({
    id: 'parent1', name: 'Jane Parent', stripeCustomerId: 'cus_existing', user: { email: 'jane@example.com' },
  })
})

describe('sendMonthlyInvoice', () => {
  it('throws BillingNotConfiguredError when Stripe is not set up', async () => {
    mockGetStripe.mockReturnValue(null)
    await expect(sendMonthlyInvoice(billing, periodStart, periodEnd)).rejects.toThrow(BillingNotConfiguredError)
    expect(p.invoice.create).not.toHaveBeenCalled()
  })

  it('reuses an existing Stripe customer instead of creating a new one', async () => {
    const stripe = {
      customers: { create: jest.fn() },
      invoiceItems: { create: jest.fn().mockResolvedValue({}) },
      invoices: {
        create: jest.fn().mockResolvedValue({ id: 'in_draft' }),
        finalizeInvoice: jest.fn().mockResolvedValue({ id: 'in_123', hosted_invoice_url: 'https://stripe.test/inv' }),
        sendInvoice: jest.fn().mockResolvedValue({}),
      },
    }
    mockGetStripe.mockReturnValue(stripe)
    p.invoice.create.mockResolvedValue({ id: 'local1', stripeInvoiceUrl: 'https://stripe.test/inv' })

    const result = await sendMonthlyInvoice(billing, periodStart, periodEnd)

    expect(stripe.customers.create).not.toHaveBeenCalled()
    expect(stripe.invoiceItems.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing', amount: 15000 }),
    )
    expect(stripe.invoices.finalizeInvoice).toHaveBeenCalledWith('in_draft')
    expect(stripe.invoices.sendInvoice).toHaveBeenCalledWith('in_123')
    expect(p.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripeInvoiceId: 'in_123', status: 'sent' }) }),
    )
    expect(result).toEqual({ id: 'local1', hostedUrl: 'https://stripe.test/inv' })
  })

  it('creates a Stripe customer when the parent has none yet', async () => {
    p.parentProfile.findUniqueOrThrow.mockResolvedValue({
      id: 'parent1', name: 'Jane Parent', stripeCustomerId: null, user: { email: 'jane@example.com' },
    })
    const stripe = {
      customers: { create: jest.fn().mockResolvedValue({ id: 'cus_new' }) },
      invoiceItems: { create: jest.fn().mockResolvedValue({}) },
      invoices: {
        create: jest.fn().mockResolvedValue({ id: 'in_draft' }),
        finalizeInvoice: jest.fn().mockResolvedValue({ id: 'in_123', hosted_invoice_url: null }),
        sendInvoice: jest.fn().mockResolvedValue({}),
      },
    }
    mockGetStripe.mockReturnValue(stripe)
    p.invoice.create.mockResolvedValue({ id: 'local1', stripeInvoiceUrl: null })

    await sendMonthlyInvoice(billing, periodStart, periodEnd)

    expect(stripe.customers.create).toHaveBeenCalledWith({ email: 'jane@example.com', name: 'Jane Parent' })
    expect(p.parentProfile.update).toHaveBeenCalledWith({ where: { id: 'parent1' }, data: { stripeCustomerId: 'cus_new' } })
  })

  it('leaves no local record if the Stripe call fails partway', async () => {
    const stripe = {
      customers: { create: jest.fn() },
      invoiceItems: { create: jest.fn().mockResolvedValue({}) },
      invoices: {
        create: jest.fn().mockResolvedValue({ id: 'in_draft' }),
        finalizeInvoice: jest.fn().mockRejectedValue(new Error('Stripe API down')),
        sendInvoice: jest.fn(),
      },
    }
    mockGetStripe.mockReturnValue(stripe)

    await expect(sendMonthlyInvoice(billing, periodStart, periodEnd)).rejects.toThrow('Stripe API down')
    expect(stripe.invoices.sendInvoice).not.toHaveBeenCalled()
    expect(p.invoice.create).not.toHaveBeenCalled()
  })
})
