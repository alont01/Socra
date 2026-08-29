'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Skeleton } from '@/components/ui/Skeleton'

interface InvoiceItem {
  id: string
  periodStart: string
  periodEnd: string
  hours: number
  rateUsd: number
  amountCents: number
  status: string
  sentAt: string | null
  paidAt: string | null
  stripeInvoiceUrl: string | null
}

interface BillingData {
  rateUsd: number
  currentPeriod: {
    start: string
    end: string
    hours: number
    estimatedAmountCents: number
    children: { studentId: string; name: string; hours: number }[]
    alreadyInvoiced: boolean
  }
  invoices: InvoiceItem[]
}

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// A parent reading this wants one thing: do I owe anything? Keep the wording
// plain and never invent a state Stripe hasn't reported.
function statusChip(status: string) {
  const styles: Record<string, string> = {
    paid: 'bg-green-100 text-green-700 ring-green-200/70',
    sent: 'bg-amber-100 text-amber-700 ring-amber-200/70',
    pending: 'bg-stone-100 text-stone-600 ring-stone-200/70',
    failed: 'bg-red-100 text-red-700 ring-red-200/70',
    uncollectible: 'bg-red-100 text-red-700 ring-red-200/70',
    void: 'bg-stone-100 text-stone-500 ring-stone-200/70',
  }
  const labels: Record<string, string> = {
    paid: 'Paid',
    sent: 'Due',
    pending: 'Being prepared',
    failed: 'Payment failed',
    uncollectible: 'Needs attention',
    void: 'Cancelled',
  }
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ring-1 ring-inset ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  )
}

export default function ParentBillingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<BillingData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
    else if (!loading && user && user.role !== 'PARENT') router.replace('/dashboard')
  }, [user, loading, router])

  const load = useCallback(() => {
    if (loading || user?.role !== 'PARENT') return
    setError(false)
    fetch('/api/parent/billing')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true))
  }, [loading, user])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/parent/dashboard" className="text-sm text-orange-600 hover:text-orange-700 font-medium">
          ← Back to dashboard
        </Link>

        <h1 className="text-2xl font-bold tracking-tight text-stone-900 mt-3 mb-2">Billing</h1>
        <p className="text-stone-500 mb-8">
          You&apos;re billed monthly for the tutoring hours actually delivered, at{' '}
          {data ? `$${data.rateUsd}` : 'a flat rate'} per hour.
        </p>

        {error ? (
          <div className="rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-8 text-center">
            <p className="text-stone-600 mb-1">We couldn&apos;t load your billing.</p>
            <p className="text-sm text-stone-500 mb-4">Nothing has changed on your account.</p>
            <button onClick={load} className="text-sm font-medium text-orange-600 hover:text-orange-700">
              Try again
            </button>
          </div>
        ) : !data ? (
          <div className="space-y-5">
            <Skeleton className="h-40 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
          </div>
        ) : (
          <>
            {/* This month so far */}
            <section className="mb-8">
              <div className="rounded-3xl bg-white ring-1 ring-stone-900/5 shadow-soft p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <h2 className="font-semibold text-stone-900">
                      {monthLabel(data.currentPeriod.start)} so far
                    </h2>
                    <p className="text-sm text-stone-500 mt-0.5">
                      {/* A plain string in an expression, so an HTML entity
                          here would render literally — use the character. */}
                      {data.currentPeriod.alreadyInvoiced
                        ? 'This month has already been invoiced — see below.'
                        : 'An estimate. You’ll be invoiced after the month ends.'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-stone-900 tabular-nums">
                      {money(data.currentPeriod.estimatedAmountCents)}
                    </p>
                    <p className="text-xs text-stone-400 tabular-nums">
                      {data.currentPeriod.hours} hour{data.currentPeriod.hours === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>

                {data.currentPeriod.children.length > 0 ? (
                  <ul className="space-y-2 border-t border-stone-100 pt-4">
                    {data.currentPeriod.children.map((c) => (
                      <li key={c.studentId} className="flex items-center justify-between text-sm">
                        <span className="text-stone-700">{c.name}</span>
                        <span className="text-stone-500 tabular-nums">
                          {c.hours} hour{c.hours === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-stone-500 border-t border-stone-100 pt-4">
                    No completed sessions yet this month.
                  </p>
                )}
              </div>
            </section>

            {/* History */}
            <section>
              <h2 className="font-semibold text-stone-900 mb-3">Invoices</h2>
              {data.invoices.length === 0 ? (
                <div className="rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-8 text-center text-stone-500">
                  No invoices yet. Your first one arrives after your first full month.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.invoices.map((inv) => (
                    <div key={inv.id} className="rounded-3xl bg-white ring-1 ring-stone-900/5 shadow-soft p-5">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <h3 className="font-semibold text-stone-900 text-sm">
                            {monthLabel(inv.periodStart)}
                          </h3>
                          <p className="text-xs text-stone-400 mt-0.5 tabular-nums">
                            {inv.hours} hour{inv.hours === 1 ? '' : 's'} · ${inv.rateUsd}/hour
                            {inv.paidAt
                              ? ` · paid ${new Date(inv.paidAt).toLocaleDateString()}`
                              : inv.sentAt
                              ? ` · sent ${new Date(inv.sentAt).toLocaleDateString()}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-stone-900 tabular-nums">
                            {money(inv.amountCents)}
                          </span>
                          {statusChip(inv.status)}
                        </div>
                      </div>
                      {/* Only Stripe can take a payment — link out rather than
                          implying this page can settle it. */}
                      {inv.stripeInvoiceUrl && inv.status !== 'paid' && inv.status !== 'void' && (
                        <a
                          href={inv.stripeInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-3 text-sm font-semibold text-orange-600 hover:text-orange-700"
                        >
                          View &amp; pay invoice →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
