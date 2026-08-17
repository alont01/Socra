'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/hooks/useToast'

interface ChildHours { studentId: string; studentName: string; hours: number }
interface BillingRow {
  parentId: string
  parentName: string
  parentEmail: string
  children: ChildHours[]
  totalHours: number
  rateUsd: number
  amountCents: number
  invoice: { status: string; stripeInvoiceUrl: string | null; sentAt: string | null } | null
}

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(value: string) {
  return new Date(`${value}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function AdminBillingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [month, setMonth] = useState(currentMonthValue())
  const [rows, setRows] = useState<BillingRow[] | null>(null)
  const [stripeConfigured, setStripeConfigured] = useState(true)
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading')
  const [sendingId, setSendingId] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
  }, [user, loading, router])

  const load = useCallback(async () => {
    setState('loading')
    try {
      const res = await fetch(`/api/admin/billing?month=${month}`)
      if (res.status === 403) return setState('forbidden')
      if (!res.ok) return setState('error')
      const data = await res.json()
      setRows(data.rows)
      setStripeConfigured(data.stripeConfigured)
      setState('ok')
    } catch {
      setState('error')
    }
  }, [month])

  useEffect(() => {
    if (!loading && user) load()
  }, [loading, user, load])

  const sendInvoice = async (parentId: string) => {
    setSendingId(parentId)
    try {
      const res = await fetch('/api/admin/billing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, month }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || 'Could not send the invoice.', 'error')
        return
      }
      toast('Invoice sent!', 'success')
      load()
    } finally {
      setSendingId(null)
    }
  }

  const totalOwed = rows?.reduce((s, r) => s + (r.invoice ? 0 : r.amountCents), 0) ?? 0

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Monthly Billing</h1>
            <p className="text-sm text-stone-500 mt-1">Hours billed at ${rows?.[0]?.rateUsd ?? '—'}/hr, computed from completed sessions.</p>
          </div>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white text-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        {!stripeConfigured && state === 'ok' && (
          <div className="mb-5 rounded-2xl bg-amber-50 ring-1 ring-amber-200/70 px-4 py-3 text-sm text-amber-800">
            Stripe isn&apos;t configured yet — hours are tracked below, but invoices can&apos;t be sent until <code className="font-mono text-xs">STRIPE_SECRET_KEY</code> is set.
          </div>
        )}

        {state === 'loading' ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) : state === 'forbidden' ? (
          <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 text-stone-600">Not authorized.</div>
        ) : state === 'error' ? (
          <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 text-stone-600">Couldn&apos;t load billing data.</div>
        ) : !rows || rows.length === 0 ? (
          <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-8 text-center text-stone-500">
            No billable sessions for {monthLabel(month)}.
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-stone-500">
              <span className="font-semibold text-stone-900">{money(totalOwed)}</span> still to invoice across {rows.filter((r) => !r.invoice).length} famil{rows.filter((r) => !r.invoice).length === 1 ? 'y' : 'ies'}.
            </div>
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.parentId} className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-semibold text-stone-900">{r.parentName}</p>
                      <p className="text-xs text-stone-400">{r.parentEmail}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                        {r.children.map((c) => (
                          <span key={c.studentId}>{c.studentName}: {c.hours} hr{c.hours === 1 ? '' : 's'}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-stone-900 tabular-nums">{money(r.amountCents)}</p>
                      <p className="text-xs text-stone-400">{r.totalHours} hr{r.totalHours === 1 ? '' : 's'} total</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    {r.invoice ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                        ✓ Sent{r.invoice.sentAt ? ` ${new Date(r.invoice.sentAt).toLocaleDateString()}` : ''}
                      </span>
                    ) : (
                      <button
                        onClick={() => sendInvoice(r.parentId)}
                        disabled={sendingId === r.parentId || !stripeConfigured}
                        className="text-sm font-medium px-4 py-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {sendingId === r.parentId ? 'Sending…' : 'Send invoice'}
                      </button>
                    )}
                    {r.invoice?.stripeInvoiceUrl && (
                      <a href={r.invoice.stripeInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:text-orange-700">
                        View invoice →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
