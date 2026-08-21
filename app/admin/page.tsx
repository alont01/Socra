'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'

interface Metrics {
  windowMinutes: number
  generatedAt: string
  ai: {
    totalCalls: number
    errorCount: number
    successRate: number | null
    avgLatencyMs: number
    totalInputTokens: number
    totalOutputTokens: number
    estCostUsd: number
    byOperation: { name: string; count: number; errors: number; avgLatencyMs: number }[]
    byModel: { model: string; inputTokens: number; outputTokens: number; estCostUsd: number }[]
  }
  quota: {
    observedAt: string | null
    requestsRemaining: number | null
    requestsLimit: number | null
    inputTokensRemaining: number | null
    outputTokensRemaining: number | null
    rateLimitedCount: number
  }
  pipeline: {
    sessionsProcessed: number
    transcript: { success: number; failed: number }
  }
  recentErrors: { id: string; name: string; category: string; createdAt: string; message: string | null }[]
}

interface Integration {
  key: string
  label: string
  status: 'ok' | 'unauthorized' | 'unreachable' | 'not_configured'
  detail: string
  impact: string
  required: boolean
  durationMs: number
  lastOkAt: string | null
}

interface IntegrationsPayload {
  checkedAt: string
  overall: 'ok' | 'degraded' | 'down'
  integrations: Integration[]
}

const WINDOWS = [
  { label: 'Last hour', minutes: 60 },
  { label: 'Last 24h', minutes: 1440 },
  { label: 'Last 7d', minutes: 10080 },
]

const REFRESH_MS = 5000
// Each refresh hits four third-party APIs, so poll far less often than metrics.
const INTEGRATIONS_REFRESH_MS = 120_000

const INTEGRATION_STATUS: Record<Integration['status'], { label: string; className: string }> = {
  ok: { label: 'OK', className: 'bg-green-100 text-green-700' },
  unauthorized: { label: 'Key rejected', className: 'bg-red-100 text-red-700' },
  unreachable: { label: 'Unreachable', className: 'bg-amber-100 text-amber-800' },
  not_configured: { label: 'Not set', className: 'bg-stone-100 text-stone-600' },
}

/** How long an integration has been unhealthy — the number you want during an outage. */
function downFor(lastOkAt: string | null): string | null {
  if (!lastOkAt) return null
  const ms = Date.now() - new Date(lastOkAt).getTime()
  if (ms < 60_000) return 'just now'
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

function IntegrationsPanel({ data, onRecheck, rechecking }: {
  data: IntegrationsPayload | null
  onRecheck: () => void
  rechecking: boolean
}) {
  if (!data) return <Skeleton className="h-40 rounded-2xl" />

  const broken = data.integrations.filter((i) => i.status !== 'ok')

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-semibold text-stone-900">External integrations</h2>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            data.overall === 'ok' ? 'bg-green-100 text-green-700'
              : data.overall === 'down' ? 'bg-red-100 text-red-700'
              : 'bg-amber-100 text-amber-800'
          }`}>
            {data.overall === 'ok' ? 'All healthy' : data.overall === 'down' ? 'Required dependency down' : 'Degraded'}
          </span>
          <button
            onClick={onRecheck}
            disabled={rechecking}
            className="text-xs font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50"
          >
            {rechecking ? 'Checking…' : 'Re-check'}
          </button>
        </div>
      </div>
      <p className="text-xs text-stone-500 mb-3">
        Probed live just now. These keys don&apos;t expire — this catches a key that was rolled, never set, or is
        rejected by the provider.
      </p>

      <div className="divide-y divide-stone-100">
        {data.integrations.map((i) => {
          const style = INTEGRATION_STATUS[i.status]
          const outage = i.status !== 'ok' ? downFor(i.lastOkAt) : null
          return (
            <div key={i.key} className="py-2.5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-stone-900">
                  {i.label}
                  {i.required && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-stone-400">required</span>}
                </div>
                <div className="text-xs text-stone-500 mt-0.5 break-words">{i.detail}</div>
                {i.status !== 'ok' && (
                  <div className="text-xs text-amber-700 mt-1">{i.impact}</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${style.className}`}>
                  {style.label}
                </span>
                <div className="text-[11px] text-stone-400 mt-1 tabular-nums">
                  {outage ? `down ${outage}` : `${i.durationMs} ms`}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {broken.length > 0 && (
        <p className="mt-3 text-xs text-stone-500">
          The team is emailed when any of these changes state — not on every check.
        </p>
      )}
    </Card>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-stone-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-stone-500">{sub}</div>}
    </Card>
  )
}

function fmt(n: number): string {
  return n.toLocaleString()
}

export default function AdminDashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [windowMinutes, setWindowMinutes] = useState(1440)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading')
  const [integrations, setIntegrations] = useState<IntegrationsPayload | null>(null)
  const [rechecking, setRechecking] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
  }, [user, loading, router])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/metrics?window=${windowMinutes}`)
      if (res.status === 403) {
        setStatus('forbidden')
        return
      }
      if (!res.ok) {
        setStatus('error')
        return
      }
      setMetrics(await res.json())
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }, [windowMinutes])

  // Integrations are probed against live third-party APIs, so they refresh on a
  // much slower cadence than the metrics poll — and on demand via Re-check.
  const loadIntegrations = useCallback(async () => {
    setRechecking(true)
    try {
      const res = await fetch('/api/admin/integrations')
      if (res.ok) setIntegrations(await res.json())
    } catch {
      // Leave the previous snapshot in place; the metrics panel reports outages.
    } finally {
      setRechecking(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    load()
    const interval = setInterval(load, REFRESH_MS)
    return () => clearInterval(interval)
  }, [user, load])

  useEffect(() => {
    if (!user) return
    loadIntegrations()
    const interval = setInterval(loadIntegrations, INTEGRATIONS_REFRESH_MS)
    return () => clearInterval(interval)
  }, [user, loadIntegrations])

  const successPct = metrics?.ai.successRate != null ? `${(metrics.ai.successRate * 100).toFixed(1)}%` : '—'
  const transcriptTotal = metrics ? metrics.pipeline.transcript.success + metrics.pipeline.transcript.failed : 0

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-stone-900">System Health</h1>
              <Link href="/admin/logs" className="text-sm text-orange-600 hover:text-orange-700 font-medium">Logs →</Link>
              <Link href="/admin/tutors" className="text-sm text-orange-600 hover:text-orange-700 font-medium">Tutors →</Link>
            </div>
            {metrics && (
              <p className="text-xs text-stone-500 mt-1">
                Live · refreshes every {REFRESH_MS / 1000}s · updated{' '}
                {new Date(metrics.generatedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex gap-1 rounded-lg bg-stone-100 p-1">
            {WINDOWS.map((w) => (
              <button
                key={w.minutes}
                onClick={() => setWindowMinutes(w.minutes)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  windowMinutes === w.minutes ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {status === 'loading' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        )}

        {status === 'forbidden' && (
          <Card className="p-6">
            <p className="text-stone-700 font-medium">Not authorized</p>
            <p className="text-sm text-stone-500 mt-1">
              Your account is not in the admin allowlist. Set <code className="text-orange-700">ADMIN_EMAILS</code>{' '}
              (comma-separated) in the environment to grant access.
            </p>
          </Card>
        )}

        {status === 'error' && (
          <Card className="p-6"><p className="text-red-600">Failed to load metrics. Retrying…</p></Card>
        )}

        {status === 'ok' && metrics && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="AI calls" value={fmt(metrics.ai.totalCalls)} sub={`${metrics.ai.errorCount} errors`} />
              <StatCard label="Success rate" value={successPct} />
              <StatCard label="Avg latency" value={`${fmt(metrics.ai.avgLatencyMs)} ms`} />
              <StatCard label="Est. spend" value={`$${metrics.ai.estCostUsd.toFixed(2)}`} sub="this window" />
              <StatCard
                label="Tokens in / out"
                value={`${fmt(metrics.ai.totalInputTokens)} / ${fmt(metrics.ai.totalOutputTokens)}`}
              />
              <StatCard label="Sessions processed" value={fmt(metrics.pipeline.sessionsProcessed)} />
              <StatCard
                label="Claude quota left"
                value={
                  metrics.quota.requestsRemaining != null
                    ? metrics.quota.requestsLimit != null
                      ? `${fmt(metrics.quota.requestsRemaining)}/${fmt(metrics.quota.requestsLimit)}`
                      : fmt(metrics.quota.requestsRemaining)
                    : '—'
                }
                sub={
                  metrics.quota.rateLimitedCount > 0
                    ? `${metrics.quota.rateLimitedCount} rate limited`
                    : metrics.quota.observedAt
                      ? `requests, as of ${new Date(metrics.quota.observedAt).toLocaleTimeString()}`
                      : 'no calls yet'
                }
              />
              <StatCard
                label="Transcript fetches"
                value={transcriptTotal > 0 ? `${metrics.pipeline.transcript.success}/${transcriptTotal}` : '—'}
                sub={`${metrics.pipeline.transcript.failed} failed`}
              />
            </div>

            {/* Live credential health — sits above the AI breakdown because a
                dead dependency explains every number below it. */}
            <IntegrationsPanel data={integrations} onRecheck={loadIntegrations} rechecking={rechecking} />

            {/* Per-operation breakdown */}
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-stone-900 mb-3">AI calls by operation</h2>
              {metrics.ai.byOperation.length === 0 ? (
                <p className="text-sm text-stone-500">No AI activity in this window.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-stone-400">
                      <th className="pb-2 font-medium">Operation</th>
                      <th className="pb-2 font-medium text-right">Calls</th>
                      <th className="pb-2 font-medium text-right">Errors</th>
                      <th className="pb-2 font-medium text-right">Avg latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.ai.byOperation.map((op) => (
                      <tr key={op.name} className="border-t border-stone-100">
                        <td className="py-2 font-mono text-xs text-stone-700">{op.name}</td>
                        <td className="py-2 text-right">{fmt(op.count)}</td>
                        <td className="py-2 text-right">
                          {op.errors > 0 ? <Badge variant="orange">{op.errors}</Badge> : <span className="text-stone-400">0</span>}
                        </td>
                        <td className="py-2 text-right text-stone-600">{fmt(op.avgLatencyMs)} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {/* Spend by model */}
            {metrics.ai.byModel.length > 0 && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-stone-900 mb-3">Spend by model</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-stone-400">
                      <th className="pb-2 font-medium">Model</th>
                      <th className="pb-2 font-medium text-right">Tokens in / out</th>
                      <th className="pb-2 font-medium text-right">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.ai.byModel.map((m) => (
                      <tr key={m.model} className="border-t border-stone-100">
                        <td className="py-2 font-mono text-xs text-stone-700">{m.model}</td>
                        <td className="py-2 text-right text-stone-600">{fmt(m.inputTokens)} / {fmt(m.outputTokens)}</td>
                        <td className="py-2 text-right">${m.estCostUsd.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            {/* Recent errors */}
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-stone-900 mb-3">Recent errors</h2>
              {metrics.recentErrors.length === 0 ? (
                <p className="text-sm text-stone-500">No errors in this window. 🎉</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.recentErrors.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 text-sm border-t border-stone-100 pt-2 first:border-0 first:pt-0">
                      <span className="text-xs text-stone-400 whitespace-nowrap mt-0.5">
                        {new Date(e.createdAt).toLocaleTimeString()}
                      </span>
                      <span className="font-mono text-xs text-stone-700 whitespace-nowrap">{e.name}</span>
                      <span className="text-stone-600 break-all">{e.message || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
