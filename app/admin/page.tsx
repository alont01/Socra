'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingDots } from '@/components/ui/LoadingDots'

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
  pipeline: {
    sessionsProcessed: number
    transcript: { success: number; failed: number }
  }
  recentErrors: { id: string; name: string; category: string; createdAt: string; message: string | null }[]
}

const WINDOWS = [
  { label: 'Last hour', minutes: 60 },
  { label: 'Last 24h', minutes: 1440 },
  { label: 'Last 7d', minutes: 10080 },
]

const REFRESH_MS = 5000

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

  useEffect(() => {
    if (!user) return
    load()
    const interval = setInterval(load, REFRESH_MS)
    return () => clearInterval(interval)
  }, [user, load])

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
          <div className="flex justify-center py-12"><LoadingDots /></div>
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
                label="Transcript fetches"
                value={transcriptTotal > 0 ? `${metrics.pipeline.transcript.success}/${transcriptTotal}` : '—'}
                sub={`${metrics.pipeline.transcript.failed} failed`}
              />
            </div>

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
