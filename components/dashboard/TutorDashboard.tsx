'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { StudentRoster } from './StudentRoster'
import { UpcomingSessionsPanel } from './UpcomingSessionsPanel'
import { TutorOffers } from './TutorOffers'
import { LoadingDots } from '@/components/ui/LoadingDots'
import Link from 'next/link'

interface Student {
  id: string
  name: string
  email: string
  gradeLevel: string
  mathTopics: string
}

interface TutoringSession {
  id: string
  topic: string
  status: string
  scheduledAt: string | null
  createdAt: string
  student?: { id: string; name: string; gradeLevel?: string } | null
}

interface TutorDashboardProps {
  tutorName: string
}

const steps = [
  { n: '1', title: 'Build your roster', desc: 'Add students by email, then invite their parents so families can follow along.' },
  { n: '2', title: 'Run a session', desc: 'Start a video session and teach. Notes and transcript are captured for you.' },
  { n: '3', title: 'Let AI do the rest', desc: 'End the session and Socra writes the recap and generates targeted practice.' },
]

export function TutorDashboard({ tutorName }: TutorDashboardProps) {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [sessions, setSessions] = useState<TutoringSession[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [newStudentId, setNewStudentId] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/tutor/students').then((r) => r.json()),
      fetch('/api/tutoring-sessions').then((r) => r.json()),
    ]).then(([studentsData, sessionsData]) => {
      setStudents(studentsData.students || [])
      setSessions(sessionsData.sessions || [])
    }).catch(() => {
      // Fail silently — dashboard will show empty state
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  const createSession = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/tutoring-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: newTopic || 'Math Session', studentId: newStudentId || undefined }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/session/${data.session.id}`)
      }
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><LoadingDots /></div>
  }

  const activeCount = sessions.filter((s) => s.status !== 'cancelled').length
  const completedCount = sessions.filter((s) => s.status === 'completed').length
  const stats = [
    { label: 'Students', value: students.length },
    { label: 'Sessions', value: activeCount },
    { label: 'Completed', value: completedCount },
  ]

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <section aria-labelledby="welcome-heading" className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 rounded-3xl p-6 sm:p-8 text-white shadow-brand">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-16 -right-8 h-52 w-52 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
        </div>
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 id="welcome-heading" className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome back, {tutorName}!</h1>
            <p className="text-orange-50 mt-1">Here&apos;s your teaching snapshot.</p>
            <dl className="mt-5 grid grid-cols-3 gap-3 max-w-md">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl bg-white/15 backdrop-blur px-3 py-2 ring-1 ring-white/20">
                  <dt className="text-[11px] text-orange-50/90 leading-tight">{s.label}</dt>
                  <dd className="text-2xl font-bold tabular-nums leading-tight">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="secondary"
              className="bg-white text-orange-600 hover:bg-orange-50 shadow-lg shadow-orange-900/10"
              onClick={() => setShowNewSession((v) => !v)}
              aria-expanded={showNewSession}
            >
              New session +
            </Button>
            <Link href="/tutor/availability" className="text-xs text-orange-50/90 hover:text-white underline underline-offset-2">
              Set availability &amp; capacity
            </Link>
          </div>
        </div>
      </section>

      {/* Pending student-match offers */}
      <TutorOffers />

      {/* New Session form */}
      {showNewSession && (
        <section aria-label="Create session" className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5">
          <h2 className="font-semibold text-stone-900 mb-3">Create a session</h2>
          <div className="flex flex-wrap gap-3">
            <label htmlFor="session-topic" className="sr-only">Topic</label>
            <input
              id="session-topic"
              type="text"
              placeholder="Topic (e.g. Fractions)"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              className="flex-1 min-w-[180px] px-3.5 py-2.5 rounded-xl bg-white text-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <label htmlFor="session-student" className="sr-only">Student</label>
            <select
              id="session-student"
              value={newStudentId}
              onChange={(e) => setNewStudentId(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-white text-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">No student (open)</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Button onClick={createSession} loading={creating} size="sm">Start</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowNewSession(false)}>Cancel</Button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roster — left */}
        <section aria-labelledby="roster-heading" className="lg:col-span-1">
          <h2 id="roster-heading" className="sr-only">Your students</h2>
          <StudentRoster
            students={students}
            onStudentAdded={(s) => setStudents((prev) => [s, ...prev])}
            onStudentRemoved={(id) => setStudents((prev) => prev.filter((s) => s.id !== id))}
          />
        </section>

        {/* Sessions — right */}
        <section aria-labelledby="sessions-heading" className="lg:col-span-2">
          <h2 id="sessions-heading" className="text-lg font-bold text-stone-900 mb-4">Sessions</h2>
          <UpcomingSessionsPanel sessions={sessions} role="TUTOR" />
        </section>
      </div>

      {/* Guide */}
      <section aria-labelledby="guide-heading" className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 sm:p-8">
        <h2 id="guide-heading" className="text-lg font-bold text-stone-900">Getting the most out of Socra</h2>
        <p className="text-sm text-stone-500 mt-1 mb-6">Your workflow, start to finish:</p>
        <ol className="grid gap-5 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n}>
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
