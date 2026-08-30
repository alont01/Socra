'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/hooks/useToast'

interface ChildHours { studentId: string; studentName: string; hours: number }
interface InvoiceSummary {
  status: string
  stripeInvoiceUrl: string | null
  sentAt: string | null
  paidAt: string | null
  amountCents: number
  lastError: string | null
}
interface BillingRow {
  parentId: string
  parentName: string
  parentEmail: string
  children: ChildHours[]
  totalHours: number
  rateUsd: number
  amountCents: number
  autoClosedSessions: number
  invoice: InvoiceSummary | null
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

// `failed` means OUR send attempt never reached Stripe — retryable, so it
// still needs invoicing. `payment_failed` means the invoice DID reach the
// family and Stripe reports the payment itself was declined — that invoice
// is still open and awaiting resolution, so it must NOT show a Send/Retry
// button (which would create a second Stripe invoice for the same hours).
/** A family still needs invoicing unless a live invoice already covers them. */
function needsInvoice(row: BillingRow) {
  return !row.invoice || row.invoice.status === 'failed'
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  paid: { label: '✓ Paid', className: 'bg-green-100 text-green-700' },
  sent: { label: 'Awaiting payment', className: 'bg-blue-100 text-blue-700' },
  pending: { label: 'In progress…', className: 'bg-stone-100 text-stone-600' },
  failed: { label: '⚠ Failed', className: 'bg-red-100 text-red-700' },
  payment_failed: { label: '⚠ Payment declined', className: 'bg-red-100 text-red-700' },
  uncollectible: { label: 'Uncollectible', className: 'bg-red-100 text-red-700' },
  void: { label: 'Voided', className: 'bg-stone-100 text-stone-500' },
}

export default function AdminBillingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [month, setMonth] = useState(currentMonthValue())
  const [rows, setRows] = useState<BillingRow[] | null>(null)
  // Comes from config, not from the rows — so it still displays in a month
  // with nothing to bill.
  const [rateUsd, setRateUsd] = useState<number | null>(null)
  const [stripeConfigured, setStripeConfigured] = useState(true)
  const [webhookConfigured, setWebhookConfigured] = useState(true)
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [bulkSending, setBulkSending] = useState(false)
  const [syncing, setSyncing] = useState(false)

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
      setRateUsd(data.rateUsd ?? null)
      setStripeConfigured(data.stripeConfigured)
      setWebhookConfigured(data.webhookConfigured)
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
    } catch {
      toast('Network error — could not send the invoice.', 'error')
    } finally {
      setSendingId(null)
      // Always refresh: a failed send still changes the row's state to `failed`,
      // and the admin needs to see that rather than a stale "not yet invoiced".
      load()
    }
  }

  const sendAll = async () => {
    const pending = rows?.filter(needsInvoice) ?? []
    if (pending.length === 0) return
    const total = pending.reduce((s, r) => s + r.amountCents, 0)
    // Real money, many families at once — make it deliberate.
    if (!window.confirm(`Send ${pending.length} invoice${pending.length === 1 ? '' : 's'} totalling ${money(total)} for ${monthLabel(month)}?`)) {
      return
    }

    setBulkSending(true)
    try {
      const res = await fetch('/api/admin/billing/send-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || 'The bulk run failed.', 'error')
        return
      }
      const sent = data.sent?.length ?? 0
      const skipped = data.skipped?.length ?? 0
      const remaining = data.remaining ?? 0
      if (remaining > 0) {
        // The run stopped at its time budget. Everything sent is committed, so
        // the admin just needs to click again to finish.
        toast(`Sent ${sent}. ${remaining} still to go — click Send all again.`, 'error')
      } else {
        toast(
          skipped > 0 ? `Sent ${sent}. ${skipped} skipped — see the rows below.` : `Sent ${sent} invoice${sent === 1 ? '' : 's'}.`,
          skipped > 0 ? 'error' : 'success',
        )
      }
    } catch {
      toast('Network error — the bulk run may be partially complete. Check the rows below.', 'error')
    } finally {
      setBulkSending(false)
      load()
    }
  }

  const syncFromStripe = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/billing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || 'Could not sync from Stripe.', 'error')
        return
      }
      toast(data.updated > 0 ? `Updated ${data.updated} of ${data.checked}.` : `All ${data.checked} up to date.`, 'success')
    } catch {
      toast('Network error — could not sync from Stripe.', 'error')
    } finally {
      setSyncing(false)
      load()
    }
  }

  const pendingRows = rows?.filter(needsInvoice) ?? []
  const totalOwed = pendingRows.reduce((s, r) => s + r.amountCents, 0)
  const totalPaid = rows?.reduce((s, r) => s + (r.invoice?.status === 'paid' ? r.invoice.amountCents : 0), 0) ?? 0

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Monthly Billing</h1>
            <p className="text-sm text-stone-500 mt-1">Hours billed at ${rateUsd ?? '—'}/hr, computed from completed sessions.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={syncFromStripe}
              disabled={syncing || !stripeConfigured}
              className="text-sm font-medium px-3 py-2 rounded-xl bg-white text-stone-700 ring-1 ring-inset ring-stone-200 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Re-read payment status from Stripe, in case a webhook was missed"
            >
              {syncing ? 'Syncing…' : 'Sync from Stripe'}
            </button>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white text-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>

        {!stripeConfigured && state === 'ok' && (
          <div className="mb-5 rounded-2xl bg-amber-50 ring-1 ring-amber-200/70 px-4 py-3 text-sm text-amber-800">
            Stripe isn&apos;t configured yet — hours are tracked below, but invoices can&apos;t be sent until <code className="font-mono text-xs">STRIPE_SECRET_KEY</code> is set.
          </div>
        )}

        {stripeConfigured && !webhookConfigured && state === 'ok' && (
          <div className="mb-5 rounded-2xl bg-amber-50 ring-1 ring-amber-200/70 px-4 py-3 text-sm text-amber-800">
            <code className="font-mono text-xs">STRIPE_WEBHOOK_SECRET</code> isn&apos;t set, so invoices will never move to <b>Paid</b> on their own.
            Set it, or use <b>Sync from Stripe</b> to refresh payment status by hand.
          </div>
        )}

        {state === 'loading' ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) : state === 'forbidden' ? (
          <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 text-stone-600">Not authorized.</div>
        ) : state === 'error' ? (
          <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 text-center">
            <p className="text-stone-600 mb-3">Couldn&apos;t load billing data.</p>
            <button onClick={load} className="text-sm font-medium text-orange-600 hover:text-orange-700">
              Try again
            </button>
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-8 text-center text-stone-500">
            No billable sessions for {monthLabel(month)}.
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="text-sm text-stone-500">
                <span className="font-semibold text-stone-900">{money(totalOwed)}</span> still to invoice across {pendingRows.length} famil{pendingRows.length === 1 ? 'y' : 'ies'}
                {totalPaid > 0 && <> · <span className="font-semibold text-green-700">{money(totalPaid)}</span> paid</>}
              </div>
              {pendingRows.length > 0 && (
                <button
                  onClick={sendAll}
                  disabled={bulkSending || !stripeConfigured}
                  className="text-sm font-medium px-4 py-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {bulkSending ? 'Sending…' : `Send all (${pendingRows.length})`}
                </button>
              )}
            </div>

            <div className="space-y-3">
              {rows.map((r) => {
                const status = r.invoice ? STATUS_STYLES[r.invoice.status] ?? { label: r.invoice.status, className: 'bg-stone-100 text-stone-600' } : null
                return (
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
                        {r.autoClosedSessions > 0 && (
                          <p className="mt-2 text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-200/70 rounded-lg px-2 py-1 inline-block">
                            {r.autoClosedSessions} session{r.autoClosedSessions === 1 ? '' : 's'} auto-closed — billed at the booked length. Worth a check.
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-stone-900 tabular-nums">{money(r.amountCents)}</p>
                        <p className="text-xs text-stone-400">{r.totalHours} hr{r.totalHours === 1 ? '' : 's'} total</p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      {status && (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.className}`}>
                          {status.label}
                          {r.invoice?.status === 'paid' && r.invoice.paidAt && ` ${new Date(r.invoice.paidAt).toLocaleDateString()}`}
                          {r.invoice?.status === 'sent' && r.invoice.sentAt && ` · sent ${new Date(r.invoice.sentAt).toLocaleDateString()}`}
                        </span>
                      )}

                      {needsInvoice(r) && (
                        <button
                          onClick={() => sendInvoice(r.parentId)}
                          disabled={sendingId === r.parentId || bulkSending || !stripeConfigured}
                          className="text-sm font-medium px-4 py-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {sendingId === r.parentId ? 'Sending…' : r.invoice?.status === 'failed' ? 'Retry invoice' : 'Send invoice'}
                        </button>
                      )}

                      {r.invoice?.stripeInvoiceUrl && (
                        <a href={r.invoice.stripeInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:text-orange-700">
                          View invoice →
                        </a>
                      )}
                    </div>

                    {r.invoice?.lastError && (
                      <p className="mt-2 text-xs text-red-600 break-words">{r.invoice.lastError}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
