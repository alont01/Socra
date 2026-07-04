'use client'

import { useEffect, useState } from 'react'
import { UpcomingSessionsPanel } from './UpcomingSessionsPanel'
import { LoadingDots } from '@/components/ui/LoadingDots'
import { useToast } from '@/hooks/useToast'
import Link from 'next/link'

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

export function StudentDashboard({ studentName, goals }: StudentDashboardProps) {
  const { toast } = useToast()
  const [sessions, setSessions] = useState<TutoringSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tutoring-sessions')
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data) => {
        setSessions(data.sessions || [])
      })
      .catch(() => {
        toast('Failed to load sessions', 'error')
      })
      .finally(() => setLoading(false))
  }, [toast])

  const [practiceSets, setPracticeSets] = useState<{ completedCount: number; problemCount: number }[]>([])

  useEffect(() => {
    fetch('/api/student/practice')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => setPracticeSets(data.practiceSets || []))
      .catch(() => {})
  }, [])

  const activeSessions = sessions.filter((s) => s.status === 'active')
  const pendingPractice = practiceSets.filter((s) => s.completedCount < s.problemCount).length

  return (
    <>
      {/* Welcome banner */}
      <div className="bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 rounded-3xl p-6 text-white mb-8 shadow-brand">
        <h1 className="text-2xl font-bold">Hey {studentName}!</h1>
        <p className="text-orange-100 mt-1">
          {goals ? `Goal: ${goals}` : 'Ready to learn some math today?'}
        </p>
        {activeSessions.length > 0 && (
          <Link href={`/session/${activeSessions[0].id}`}>
            <button className="mt-4 bg-white text-orange-600 font-semibold px-6 py-2 rounded-xl hover:bg-orange-50 transition-colors text-sm">
              Join Live Session
            </button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Link href="/student/practice" className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5 hover:ring-orange-200/70 hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300">
          <div className="mb-3 grid place-items-center h-10 w-10 rounded-xl bg-gradient-to-br from-orange-50 to-amber-100 ring-1 ring-orange-100 text-orange-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />
            </svg>
          </div>
          <h3 className="font-semibold text-stone-900 text-sm">Practice Sets</h3>
          <p className="text-xs text-stone-400 mt-1">
            {pendingPractice > 0 ? `${pendingPractice} sets to complete` : 'All caught up!'}
          </p>
        </Link>
        <Link href="/student/progress" className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5 hover:ring-orange-200/70 hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300">
          <div className="mb-3 grid place-items-center h-10 w-10 rounded-xl bg-gradient-to-br from-orange-50 to-amber-100 ring-1 ring-orange-100 text-orange-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M4 19V5m0 14h16M7 15l3.5-3.5 3 3L20 8m0 0h-4m4 0v4" />
            </svg>
          </div>
          <h3 className="font-semibold text-stone-900 text-sm">My Progress</h3>
          <p className="text-xs text-stone-400 mt-1">Track your mastery</p>
        </Link>
        <Link href="/student/chat" className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5 hover:ring-orange-200/70 hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300">
          <div className="mb-3 grid place-items-center h-10 w-10 rounded-xl bg-gradient-to-br from-orange-50 to-amber-100 ring-1 ring-orange-100 text-orange-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z" />
            </svg>
          </div>
          <h3 className="font-semibold text-stone-900 text-sm">AI Help</h3>
          <p className="text-xs text-stone-400 mt-1">Ask AI anything, anytime</p>
        </Link>
      </div>

      <h2 className="font-bold text-stone-900 mb-4">Sessions</h2>
      {loading ? (
        <div className="flex justify-center py-8">
          <LoadingDots />
        </div>
      ) : (
        <UpcomingSessionsPanel sessions={sessions} role="STUDENT" />
      )}
    </>
  )
}
