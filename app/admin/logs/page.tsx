'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Skeleton } from '@/components/ui/Skeleton'

type Tab = 'audit' | 'events'

interface AuditRow {
  id: string
  actorEmail: string | null
  actorRole: string | null
  action: string
  status: string
  targetType: string | null
  targetId: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
  meta: Record<string, unknown>
}

interface EventRow {
  id: string
  category: string
  name: string
  level: string
  success: boolean | null
  durationMs: number | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: string
  meta: Record<string, unknown>
  requestPreview: string | null
  responsePreview: string | null
}

const WINDOWS = [
  { label: 'Last 24h', minutes: 1440 },
  { label: 'Last 7d', minutes: 10080 },
  { label: 'Last 30d', minutes: 43200 },
  { label: 'All time', minutes: 0 },
]

const PAGE_SIZE = 50

function Pill({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'stone'; children: ReactNode }) {
  const tones = {
    green: 'bg-green-100 text-green-700 ring-green-200/70',
    red: 'bg-red-100 text-red-700 ring-red-200/70',
    amber: 'bg-amber-100 text-amber-700 ring-amber-200/70',
    stone: 'bg-stone-100 text-stone-600 ring-stone-200/70',
  }[tone]
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${tones}`}>{children}</span>
}

function timeAgo(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default function AdminLogsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('audit')
  const [q, setQ] = useState('')
  const [windowMinutes, setWindowMinutes] = useState(10080)
  const [filter, setFilter] = useState('') // action (audit) or category (events)
  const [status, setStatus] = useState('') // status (audit) or level (events)
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<(AuditRow | EventRow)[]>([])
  const [total, setTotal] = useState(0)
  const [actions, setActions] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading')

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
  }, [user, loading, router])

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (q) params.set('q', q)
    if (windowMinutes > 0) params.set('from', new Date(Date.now() - windowMinutes * 60_000).toISOString())
    if (tab === 'audit') {
      if (filter) params.set('action', filter)
      if (status) params.set('status', status)
    } else {
      if (filter) params.set('category', filter)
      if (status) params.set('level', status)
    }
    try {
      const res = await fetch(`/api/admin/${tab}?${params.toString()}`)
      if (res.status === 403) return setState('forbidden')
      if (!res.ok) return setState('error')
      const data = await res.json()
      setRows(data.items)
      setTotal(data.total)
      if (tab === 'audit' && Array.isArray(data.actions)) setActions(data.actions)
      setState('ok')
    } catch {
      setState('error')
    }
  }, [tab, q, windowMinutes, filter, status, page])

  useEffect(() => { load() }, [load])

  // Reset paging/filters when switching tabs.
  const switchTab = (t: Tab) => {
    setTab(t); setPage(1); setFilter(''); setStatus(''); setExpanded(null)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const eventCategories = ['ai', 'daily', 'email', 'transcript', 'session', 'lead', 'http', 'error']

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Sub-nav */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">Logs</h1>
            <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
              {(['audit', 'events'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    tab === t ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  {t === 'audit' ? 'Audit trail' : 'System events'}
                </button>
              ))}
            </div>
          </div>
          <Link href="/admin" className="text-sm text-orange-600 hover:text-orange-700 font-medium">
            ← Metrics
          </Link>
        </div>

        {state === 'forbidden' ? (
          <div className="rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-8 text-center text-stone-500">
            You don&apos;t have access to the admin area.
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1) }}
                placeholder="Search…"
                className="flex-1 min-w-[180px] px-3.5 py-2 rounded-xl bg-white text-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <select
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setPage(1) }}
                className="px-3 py-2 rounded-xl bg-white text-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="">{tab === 'audit' ? 'All actions' : 'All categories'}</option>
                {(tab === 'audit' ? actions : eventCategories).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1) }}
                className="px-3 py-2 rounded-xl bg-white text-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {tab === 'audit' ? (
                  <>
                    <option value="">Any status</option>
                    <option value="success">Success</option>
                    <option value="failure">Failure</option>
                  </>
                ) : (
                  <>
                    <option value="">Any level</option>
                    <option value="info">Info</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                  </>
                )}
              </select>
              <select
                value={windowMinutes}
                onChange={(e) => { setWindowMinutes(Number(e.target.value)); setPage(1) }}
                className="px-3 py-2 rounded-xl bg-white text-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {WINDOWS.map((w) => <option key={w.minutes} value={w.minutes}>{w.label}</option>)}
              </select>
              <button
                onClick={() => load()}
                className="px-3 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                Refresh
              </button>
            </div>

            {/* Table */}
            <div className="rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft overflow-hidden">
              {state === 'loading' ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 rounded-lg" />
                  ))}
                </div>
              ) : state === 'error' ? (
                <div className="py-16 text-center text-stone-500">Failed to load logs.</div>
              ) : rows.length === 0 ? (
                <div className="py-16 text-center text-stone-400 text-sm">No entries match these filters.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-900/5">
                      <th className="px-4 py-3 font-medium">Time</th>
                      {tab === 'audit' ? (
                        <>
                          <th className="px-4 py-3 font-medium">Actor</th>
                          <th className="px-4 py-3 font-medium">Action</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Target</th>
                          <th className="px-4 py-3 font-medium">IP</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3 font-medium">Category</th>
                          <th className="px-4 py-3 font-medium">Name</th>
                          <th className="px-4 py-3 font-medium">Level</th>
                          <th className="px-4 py-3 font-medium">OK</th>
                          <th className="px-4 py-3 font-medium">Latency</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const isAudit = tab === 'audit'
                      const a = r as AuditRow
                      const e = r as EventRow
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                          className="border-b border-stone-900/5 last:border-0 hover:bg-stone-50/60 cursor-pointer align-top"
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-stone-500 text-xs">{timeAgo(r.createdAt)}</td>
                          {isAudit ? (
                            <>
                              <td className="px-4 py-3">
                                <div className="text-stone-800">{a.actorEmail || <span className="text-stone-400">anonymous</span>}</div>
                                {a.actorRole && <div className="text-xs text-stone-400">{a.actorRole}</div>}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-stone-700">{a.action}</td>
                              <td className="px-4 py-3">
                                <Pill tone={a.status === 'failure' ? 'red' : 'green'}>{a.status}</Pill>
                              </td>
                              <td className="px-4 py-3 text-stone-500 text-xs">
                                {a.targetType ? `${a.targetType}:${a.targetId?.slice(0, 8)}` : '—'}
                              </td>
                              <td className="px-4 py-3 text-stone-400 text-xs font-mono">{a.ip || '—'}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-stone-600 text-xs">{e.category}</td>
                              <td className="px-4 py-3 font-mono text-xs text-stone-700">{e.name}</td>
                              <td className="px-4 py-3">
                                <Pill tone={e.level === 'error' ? 'red' : e.level === 'warn' ? 'amber' : 'stone'}>{e.level}</Pill>
                              </td>
                              <td className="px-4 py-3 text-xs">
                                {e.success === null ? '—' : e.success ? <span className="text-green-600">✓</span> : <span className="text-red-600">✕</span>}
                              </td>
                              <td className="px-4 py-3 text-stone-500 text-xs">{e.durationMs != null ? `${e.durationMs}ms` : '—'}</td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Expanded metadata (below the table for the selected row) */}
            {expanded && rows.find((r) => r.id === expanded) && (
              <pre className="mt-3 rounded-2xl ring-1 ring-stone-900/5 bg-stone-900 text-stone-100 text-xs p-4 overflow-x-auto">
                {JSON.stringify(rows.find((r) => r.id === expanded), null, 2)}
              </pre>
            )}

            {/* Pagination */}
            {state === 'ok' && total > 0 && (
              <div className="flex items-center justify-between mt-4 text-sm text-stone-500">
                <span>{total.toLocaleString()} entries · page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 rounded-lg ring-1 ring-inset ring-stone-200 bg-white disabled:opacity-40 hover:bg-stone-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 rounded-lg ring-1 ring-inset ring-stone-200 bg-white disabled:opacity-40 hover:bg-stone-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
