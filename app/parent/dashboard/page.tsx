'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Skeleton } from '@/components/ui/Skeleton'

interface Child {
  id: string
  name: string
  gradeLevel: string
  goals: string
  avgMastery: number | null
  topicsTracked: number
  lastSession: { topic: string; endedAt: string | null } | null
}

function masteryTone(avg: number | null) {
  if (avg === null) return { text: 'No data yet', color: 'bg-stone-100 text-stone-600 ring-stone-200/70' }
  if (avg >= 0.8) return { text: 'Mastered', color: 'bg-green-100 text-green-700 ring-green-200/70' }
  if (avg >= 0.5) return { text: 'Progressing', color: 'bg-amber-100 text-amber-700 ring-amber-200/70' }
  return { text: 'Building', color: 'bg-orange-100 text-orange-700 ring-orange-200/70' }
}

export default function ParentDashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [children, setChildren] = useState<Child[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
    else if (!loading && user && user.role !== 'PARENT') router.replace('/dashboard')
  }, [user, loading, router])

  useEffect(() => {
    if (loading || user?.role !== 'PARENT') return
    fetch('/api/parent/children')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setChildren(data.children || []))
      .catch(() => setError(true))
  }, [loading, user])

  const parentName = user?.parentProfile?.name || 'there'

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Banner */}
        <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 rounded-3xl p-6 text-white mb-8 shadow-brand">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-16 -right-8 h-52 w-52 rounded-full bg-white/15 blur-2xl" />
            <div className="absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
          </div>
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Hi {parentName}!</h1>
              <p className="text-orange-100 mt-1">Follow your child&apos;s math progress, session by session.</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Link href="/parent/children/new">
                <button className="bg-white text-orange-600 font-semibold px-5 py-2 rounded-xl shadow-lg shadow-orange-900/10 hover:bg-orange-50 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 text-sm">
                  Add a child +
                </button>
              </Link>
              <Link href="/parent/billing" className="text-xs text-orange-50/90 hover:text-white underline underline-offset-2">
                Billing &amp; invoices
              </Link>
            </div>
          </div>
        </div>

        {loading || (children === null && !error) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-3xl" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-8 text-center text-stone-500">
            Couldn&apos;t load your children. Please try again.
          </div>
        ) : children && children.length === 0 ? (
          <div className="rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-10 text-center">
            <div className="mx-auto mb-4 grid place-items-center h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100 ring-1 ring-orange-100 text-orange-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 10v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
              </svg>
            </div>
            <h2 className="font-semibold text-stone-900 mb-1">Add your first child</h2>
            <p className="text-stone-500 text-sm mb-5">Set up your child&apos;s account to start tracking their progress. It takes a minute.</p>
            <Link href="/parent/children/new">
              <button className="bg-orange-500 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-orange-600 transition-colors text-sm">
                Add your child
              </button>
            </Link>
            <p className="text-xs text-stone-400 mt-4">
              Already have an invite code from a tutor? <Link href="/parent/join" className="text-orange-600 hover:text-orange-700">Enter it here</Link>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {children?.map((c) => {
              const tone = masteryTone(c.avgMastery)
              const pct = c.avgMastery === null ? null : Math.round(c.avgMastery * 100)
              return (
                <Link
                  key={c.id}
                  href={`/parent/children/${c.id}`}
                  className="group bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 hover:ring-orange-200/70 hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold shadow-brand">
                        {c.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <h3 className="font-semibold text-stone-900 leading-tight">{c.name}</h3>
                        {c.gradeLevel && <p className="text-xs text-stone-400">{c.gradeLevel}</p>}
                      </div>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ring-1 ring-inset ${tone.color}`}>
                      {tone.text}
                    </span>
                  </div>

                  {pct !== null && (
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-stone-500 mb-1">
                        <span>Average mastery</span>
                        <span className="font-medium text-stone-700 tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-stone-400">
                    <span>{c.topicsTracked} topic{c.topicsTracked === 1 ? '' : 's'} tracked</span>
                    <span>
                      {c.lastSession
                        ? `Last: ${c.lastSession.topic || 'session'}`
                        : 'No sessions yet'}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
