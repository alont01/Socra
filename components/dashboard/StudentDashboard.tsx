'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UpcomingSessionsPanel } from './UpcomingSessionsPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/hooks/useToast'
import { fetchAllTutoringSessions } from '@/lib/fetch-sessions'

/**
 * How many of the (fully-fetched, most-recent-first) sessions the "Your
 * sessions" list actually renders. The stat tiles below still derive from
 * every session — only the list itself stays a short recent-activity view.
 */
const SESSIONS_LIST_LIMIT = 20

interface TutoringSession {
  id: string
  topic: string
  status: string
  scheduledAt: string | null
  createdAt: string
  tutor?: { id: string; name: string } | null
}

interface StudentDashboardProps {
  studentName: string
  goals: string
}

const ICONS = {
  practice: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4',
  progress: 'M4 19V5m0 14h16M7 15l3.5-3.5 3 3L20 8m0 0h-4m4 0v4',
  chat: 'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z',
}

const actions = [
  { href: '/student/practice', icon: ICONS.practice, title: 'Practice Sets', desc: 'Work through problems built from your sessions.' },
  { href: '/student/progress', icon: ICONS.progress, title: 'My Progress', desc: 'See your mastery grow, topic by topic.' },
  { href: '/student/chat', icon: ICONS.chat, title: 'AI Help', desc: 'Ask the AI tutor anything, anytime.' },
]

const steps = [
  { n: '1', title: 'Meet your tutor', desc: 'Join a live video session. Your tutor teaches while the AI quietly takes notes.' },
  { n: '2', title: 'Get your recap', desc: 'When the session ends, the AI summarizes what you covered and spots any gaps.' },
  { n: '3', title: 'Practice & improve', desc: 'Complete practice built from your gaps — your mastery updates automatically.' },
]

export function StudentDashboard({ studentName, goals }: StudentDashboardProps) {
  const { toast } = useToast()
  const [sessions, setSessions] = useState<TutoringSession[]>([])
  const [loading, setLoading] = useState(true)
  const [practiceSets, setPracticeSets] = useState<{ completedCount: number; problemCount: number }[]>([])
  // undefined = still loading; null = confirmed no tutor assigned yet.
  const [tutor, setTutor] = useState<{ id: string; name: string } | null | undefined>(undefined)

  useEffect(() => {
    // Fetched in full (not just the first page) so the stat tiles below —
    // "Upcoming sessions" in particular — count every session, not just the
    // newest 50-100.
    fetchAllTutoringSessions<TutoringSession>()
      .then((all) => setSessions(all))
      .catch(() => toast('Failed to load sessions', 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(() => {
    fetch('/api/student/practice')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setPracticeSets(data.practiceSets || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/student/tutor')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setTutor(data.tutor))
      .catch(() => setTutor(null))
  }, [])

  const activeSessions = sessions.filter((s) => s.status === 'active')
  const pendingPractice = practiceSets.filter((s) => s.completedCount < s.problemCount).length
  const completedPractice = practiceSets.filter((s) => s.problemCount > 0 && s.completedCount >= s.problemCount).length
  const upcomingSessions = sessions.filter((s) => s.status === 'scheduled' || s.status === 'active')
  const upcomingCount = upcomingSessions.length
  // Soonest upcoming session (scheduled sorts by date; an active call with no
  // date, or one with a date, both count — active always takes priority since
  // it's happening right now).
  //
  // A dateless session still counts here. The tutor's "New session" dialog has
  // no date field, so every session it creates has a null scheduledAt — and
  // filtering those out left the card reading "Nothing scheduled yet" directly
  // beside a stat saying "Upcoming sessions: 1", with no way in. Dated sessions
  // sort first (soonest wins); an undated one is the fallback, rendered as
  // "time TBD".
  const datedSessions = [...upcomingSessions]
    .filter((s) => s.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
  const undatedSessions = upcomingSessions.filter((s) => !s.scheduledAt)

  const nextSession = activeSessions[0] || datedSessions[0] || undatedSessions[0] || null

  const formatWhen = (dateStr: string | null) => {
    if (!dateStr) return null
    return new Date(dateStr).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const stats = [
    { label: 'Practice to do', value: pendingPractice },
    { label: 'Sets completed', value: completedPractice },
    { label: 'Upcoming sessions', value: upcomingCount },
  ]

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <section aria-labelledby="welcome-heading" className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 rounded-3xl p-6 sm:p-8 text-white shadow-brand">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-16 -right-8 h-52 w-52 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
        </div>
        <div className="relative">
          <h1 id="welcome-heading" className="text-2xl sm:text-3xl font-bold tracking-tight">Hey {studentName}!</h1>
          <p className="text-orange-50 mt-1">
            {goals ? `Your goal: ${goals}` : 'Ready to learn some math today?'}
          </p>

          {/* Inline stats */}
          <dl className="mt-5 grid grid-cols-3 gap-3 max-w-md">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl bg-white/15 backdrop-blur px-3 py-2 ring-1 ring-white/20">
                <dt className="text-[11px] text-orange-50/90 leading-tight">{s.label}</dt>
                <dd className="text-2xl font-bold tabular-nums leading-tight">{s.value}</dd>
              </div>
            ))}
          </dl>

          {activeSessions.length > 0 && (
            <Link
              href={`/session/${activeSessions[0].id}`}
              className="inline-flex mt-5 bg-white text-orange-600 font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-orange-900/10 hover:bg-orange-50 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-orange-600"
            >
              Join your live session →
            </Link>
          )}
        </div>
      </section>

      {/* Status: tutor + next session — always visible so there's no confusion */}
      <section aria-labelledby="status-heading">
        <h2 id="status-heading" className="sr-only">Your tutor and next session</h2>
        {tutor === undefined ? (
          <Skeleton className="h-20 rounded-3xl" />
        ) : tutor === null ? (
          <div className="flex items-center gap-4 bg-amber-50 ring-1 ring-amber-200/70 rounded-3xl p-5">
            <span aria-hidden className="grid place-items-center h-11 w-11 rounded-2xl bg-amber-100 text-amber-600 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
              </svg>
            </span>
            <div>
              <h3 className="font-semibold text-stone-900 text-sm">We&apos;re finding your tutor</h3>
              <p className="text-sm text-stone-500 mt-0.5">You&apos;re not matched with a tutor yet — we&apos;ll let you know as soon as you are. No action needed.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 bg-white ring-1 ring-stone-900/5 shadow-soft rounded-3xl p-5 flex-wrap">
            <span aria-hidden className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold shadow-brand shrink-0">
              {tutor.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex-1 min-w-[180px]">
              <p className="text-xs text-stone-400">Your tutor</p>
              <h3 className="font-semibold text-stone-900 text-sm">{tutor.name}</h3>
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-xs text-stone-400">Next session</p>
              {nextSession ? (
                <p className="text-sm font-medium text-stone-700">
                  {nextSession.status === 'active' ? (
                    <span className="text-green-700">Live now — {nextSession.topic || 'session'}</span>
                  ) : (
                    <>{nextSession.topic || 'Session'} · {formatWhen(nextSession.scheduledAt) || 'time TBD'}</>
                  )}
                </p>
              ) : (
                <p className="text-sm text-stone-500">Nothing scheduled yet</p>
              )}
            </div>
            {nextSession && (
              <Link
                href={`/session/${nextSession.id}`}
                className="text-sm font-semibold text-orange-600 hover:text-orange-700 shrink-0"
              >
                {nextSession.status === 'active' ? 'Join now →' : 'View →'}
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="sr-only">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5 hover:ring-orange-200/70 hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <div aria-hidden className="mb-3 grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100 ring-1 ring-orange-100 text-orange-600 transition-transform duration-300 group-hover:scale-105">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d={a.icon} />
                </svg>
              </div>
              <h3 className="font-semibold text-stone-900">{a.title}</h3>
              <p className="text-sm text-stone-500 mt-1 leading-relaxed">{a.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Sessions */}
      <section aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" className="text-lg font-bold text-stone-900 mb-4">Your sessions</h2>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 rounded-3xl" />
            <Skeleton className="h-16 rounded-3xl" />
          </div>
        ) : (
          <UpcomingSessionsPanel sessions={sessions.slice(0, SESSIONS_LIST_LIMIT)} role="STUDENT" />
        )}
      </section>

      {/* Guide */}
      <section aria-labelledby="guide-heading" className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 sm:p-8">
        <h2 id="guide-heading" className="text-lg font-bold text-stone-900">How Socra helps you learn</h2>
        <p className="text-sm text-stone-500 mt-1 mb-6">Every session makes your practice smarter. Here&apos;s the loop:</p>
        <ol className="grid gap-5 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="relative">
              <span aria-hidden className="grid place-items-center h-8 w-8 rounded-full bg-orange-100 text-orange-700 font-bold text-sm mb-3">{s.n}</span>
              <h3 className="font-semibold text-stone-900 text-sm">{s.title}</h3>
              <p className="text-sm text-stone-500 mt-1 leading-relaxed">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
