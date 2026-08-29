'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/Button'
import { MasteryChart } from '@/components/progress/MasteryChart'
import { MasteryTrend, type TrendPoint } from '@/components/progress/MasteryTrend'
import { Skeleton } from '@/components/ui/Skeleton'

interface ProgressItem { topic: string; mastery: number; updatedAt: string }
interface SessionItem {
  id: string
  topic: string
  endedAt: string | null
  /** ready = a real recap; pending = still processing; unavailable = it failed. */
  recapStatus?: 'ready' | 'pending' | 'unavailable'
  analysis: { summary: string; conceptsCovered: string[]; strengths: string[]; gaps: string[] } | null
}
interface UpcomingSessionItem {
  id: string
  topic: string
  status: string
  scheduledAt: string | null
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
  const [tutor, setTutor] = useState<{ id: string; name: string } | null>(null)
  const [upcoming, setUpcoming] = useState<UpcomingSessionItem[]>([])
  const [username, setUsername] = useState<string | null>(null)
  // A network blip is not the same as "this child isn't yours" — collapsing
  // both into notFound told parents their child had been unlinked whenever
  // their connection hiccuped.
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'notFound' | 'error'>('loading')

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
    else if (!loading && user && user.role !== 'PARENT') router.replace('/dashboard')
  }, [user, loading, router])

  const load = useCallback(() => {
    if (loading || user?.role !== 'PARENT' || !childId) return
    setLoadState('loading')
    Promise.all([
      fetch(`/api/parent/children/${childId}/progress`),
      fetch(`/api/parent/children/${childId}/sessions`),
    ])
      .then(async ([pRes, sRes]) => {
        if (pRes.status === 404 || sRes.status === 404) { setLoadState('notFound'); return }
        if (!pRes.ok || !sRes.ok) { setLoadState('error'); return }
        const [p, s] = await Promise.all([pRes.json(), sRes.json()])
        setChildName(p.child?.name || s.child?.name || '')
        setUsername(p.child?.username ?? null)
        setProgress(p.progress || [])
        setTrend(p.trend || [])
        setSessions(s.sessions || [])
        setTutor(s.tutor || null)
        setUpcoming(s.upcomingSessions || [])
        setLoadState('ok')
      })
      .catch(() => setLoadState('error'))
  }, [loading, user, childId])

  useEffect(() => { load() }, [load])

  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const resetPassword = async () => {
    setResetting(true)
    setResetError('')
    try {
      const res = await fetch(`/api/parent/children/${childId}/password`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResetError(data.error || 'Could not reset the password. Please try again.')
        return
      }
      setNewPassword(data.credentials.password)
      if (data.credentials.username) setUsername(data.credentials.username)
    } catch {
      setResetError('Network error. Please try again.')
    } finally {
      setResetting(false)
    }
  }

  const copyPassword = async () => {
    if (!newPassword) return
    try {
      await navigator.clipboard.writeText(newPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — the password is on screen either way */
    }
  }

  const dateFmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  // Next-session display needs the time, not just the date.
  const whenFmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/parent/dashboard" className="text-sm text-orange-600 hover:text-orange-700 font-medium">
          ← All children
        </Link>

        {loadState === 'notFound' ? (
          <div className="mt-6 rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-8 text-center text-stone-500">
            This child isn&apos;t linked to your account.
          </div>
        ) : loadState === 'error' ? (
          <div className="mt-6 rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-8 text-center">
            <p className="text-stone-600 mb-1">We couldn&apos;t load this page.</p>
            <p className="text-sm text-stone-500 mb-4">
              This was a connection problem — nothing about your child&apos;s account has changed.
            </p>
            <button onClick={load} className="text-sm font-medium text-orange-600 hover:text-orange-700">
              Try again
            </button>
          </div>
        ) : loadState === 'loading' || progress === null || sessions === null ? (
          <div className="mt-6 space-y-6">
            <Skeleton className="h-64 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 mt-3 mb-6">
              {childName}&apos;s progress
            </h1>

            {/* Status: tutor + next session — always visible so it's clear
                whether a tutor is assigned yet and when the next session is. */}
            <section className="mb-8">
              {tutor === null ? (
                <div className="flex items-center gap-4 bg-amber-50 ring-1 ring-amber-200/70 rounded-3xl p-5">
                  <span aria-hidden className="grid place-items-center h-11 w-11 rounded-2xl bg-amber-100 text-amber-600 shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
                    </svg>
                  </span>
                  <div>
                    <h2 className="font-semibold text-stone-900 text-sm">We&apos;re finding {childName}&apos;s tutor</h2>
                    <p className="text-sm text-stone-500 mt-0.5">Not matched with a tutor yet — we&apos;ll email you as soon as they are. No action needed.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 bg-white ring-1 ring-stone-900/5 shadow-soft rounded-3xl p-5 flex-wrap">
                  <span aria-hidden className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold shadow-brand shrink-0">
                    {tutor.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-xs text-stone-400">Tutor</p>
                    <h2 className="font-semibold text-stone-900 text-sm">{tutor.name}</h2>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-xs text-stone-400">Next session</p>
                    {upcoming[0] ? (
                      <p className="text-sm font-medium text-stone-700">
                        {upcoming[0].status === 'active' ? (
                          <span className="text-green-700">Live now — {upcoming[0].topic || 'session'}</span>
                        ) : (
                          <>{upcoming[0].topic || 'Session'} · {upcoming[0].scheduledAt ? whenFmt(upcoming[0].scheduledAt) : 'time TBD'}</>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-stone-500">Nothing scheduled yet</p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Sign-in details. A child account has a synthetic email nothing
                can deliver to, so this reset is the only way back in. */}
            <section className="mb-8">
              <div className="bg-white ring-1 ring-stone-900/5 shadow-soft rounded-3xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="font-semibold text-stone-900 text-sm">Sign-in details</h2>
                    <p className="text-sm text-stone-500 mt-0.5">
                      {username
                        ? <>{childName} signs in with the username <span className="font-mono text-stone-700">{username}</span>.</>
                        : <>{childName} signs in with the username you chose.</>}
                    </p>
                  </div>
                  {!newPassword && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={resetting}
                      onClick={resetPassword}
                    >
                      Reset password
                    </Button>
                  )}
                </div>

                {resetError && (
                  <p className="text-sm text-red-600 mt-3" role="alert">{resetError}</p>
                )}

                {newPassword && (
                  <div className="mt-4 rounded-2xl bg-orange-50 ring-1 ring-orange-100 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-stone-500">New password</p>
                    <div className="flex items-center justify-between gap-3 mt-1">
                      <p className="font-mono text-stone-900">{newPassword}</p>
                      <button
                        onClick={copyPassword}
                        className="text-xs font-medium text-orange-600 hover:text-orange-700 px-2 py-1 shrink-0"
                      >
                        {copied ? 'Copied ✓' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs text-stone-500 mt-3">
                      Share this with {childName}. For security we won&apos;t show it again — but you can always reset it from here.
                    </p>
                  </div>
                )}
              </div>
            </section>

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
                      ) : s.recapStatus === 'unavailable' ? (
                        <p className="text-sm text-stone-400 italic">
                          No recap for this session — ask {childName}&apos;s tutor if you&apos;d like one.
                        </p>
                      ) : (
                        <p className="text-sm text-stone-400 italic">Recap is still being written.</p>
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
