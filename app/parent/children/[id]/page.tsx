'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { MasteryChart } from '@/components/progress/MasteryChart'
import { MasteryTrend, type TrendPoint } from '@/components/progress/MasteryTrend'
import { LoadingDots } from '@/components/ui/LoadingDots'

interface ProgressItem { topic: string; mastery: number; updatedAt: string }
interface SessionItem {
  id: string
  topic: string
  endedAt: string | null
  analysis: { summary: string; conceptsCovered: string[]; strengths: string[]; gaps: string[] } | null
}

export default function ParentChildPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const childId = params.id

  const [childName, setChildName] = useState('')
  const [progress, setProgress] = useState<ProgressItem[] | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [sessions, setSessions] = useState<SessionItem[] | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
    else if (!loading && user && user.role !== 'PARENT') router.replace('/dashboard')
  }, [user, loading, router])

  useEffect(() => {
    if (loading || user?.role !== 'PARENT' || !childId) return
    Promise.all([
      fetch(`/api/parent/children/${childId}/progress`),
      fetch(`/api/parent/children/${childId}/sessions`),
    ])
      .then(async ([pRes, sRes]) => {
        if (pRes.status === 404 || sRes.status === 404) { setNotFound(true); return }
        if (!pRes.ok || !sRes.ok) throw new Error()
        const [p, s] = await Promise.all([pRes.json(), sRes.json()])
        setChildName(p.child?.name || s.child?.name || '')
        setProgress(p.progress || [])
        setTrend(p.trend || [])
        setSessions(s.sessions || [])
      })
      .catch(() => setNotFound(true))
  }, [loading, user, childId])

  const dateFmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/parent/dashboard" className="text-sm text-orange-600 hover:text-orange-700 font-medium">
          ← All children
        </Link>

        {notFound ? (
          <div className="mt-6 rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-8 text-center text-stone-500">
            This child isn&apos;t linked to your account.
          </div>
        ) : progress === null || sessions === null ? (
          <div className="flex justify-center py-16"><LoadingDots /></div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 mt-3 mb-6">
              {childName}&apos;s progress
            </h1>

            {/* Trend over time */}
            <section className="mb-8">
              <MasteryTrend points={trend} />
            </section>

            {/* Mastery */}
            <section className="mb-10">
              <h2 className="font-semibold text-stone-900 mb-3">Topic mastery</h2>
              <MasteryChart progress={progress} />
            </section>

            {/* Sessions */}
            <section>
              <h2 className="font-semibold text-stone-900 mb-3">Recent sessions</h2>
              {sessions.length === 0 ? (
                <div className="rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-8 text-center text-stone-500">
                  No completed sessions yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {sessions.map((s) => (
                    <div key={s.id} className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-stone-900">{s.topic || 'Math session'}</h3>
                        <span className="text-xs text-stone-400">{dateFmt(s.endedAt)}</span>
                      </div>
                      {s.analysis ? (
                        <>
                          {s.analysis.summary && (
                            <p className="text-sm text-stone-600 leading-relaxed mb-3">{s.analysis.summary}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {s.analysis.strengths.map((t, i) => (
                              <span key={`st${i}`} className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 ring-1 ring-inset ring-green-200/70">
                                ✓ {t}
                              </span>
                            ))}
                            {s.analysis.gaps.map((t, i) => (
                              <span key={`gp${i}`} className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200/70">
                                Focus: {t}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-stone-400 italic">Analysis pending.</p>
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
