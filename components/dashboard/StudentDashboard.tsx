'use client'

import { useEffect, useState } from 'react'
import { UpcomingSessionsPanel } from './UpcomingSessionsPanel'
import { LoadingDots } from '@/components/ui/LoadingDots'
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
  const [sessions, setSessions] = useState<TutoringSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tutoring-sessions')
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions || [])
        setLoading(false)
      })
  }, [])

  const activeSessions = sessions.filter((s) => s.status === 'active')
  const pendingPractice = 0 // Will be populated in Phase 5

  return (
    <>
      {/* Welcome banner */}
      <div className="bg-orange-500 rounded-2xl p-6 text-white mb-8">
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
        <Link href="/student/practice" className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5 hover:border-orange-300 transition-colors">
          <div className="text-2xl mb-2">📝</div>
          <h3 className="font-semibold text-stone-900 text-sm">Practice Sets</h3>
          <p className="text-xs text-stone-400 mt-1">
            {pendingPractice > 0 ? `${pendingPractice} sets to complete` : 'All caught up!'}
          </p>
        </Link>
        <Link href="/student/progress" className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5 hover:border-orange-300 transition-colors">
          <div className="text-2xl mb-2">📈</div>
          <h3 className="font-semibold text-stone-900 text-sm">My Progress</h3>
          <p className="text-xs text-stone-400 mt-1">Track your mastery</p>
        </Link>
        <Link href="/student/chat" className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5 hover:border-orange-300 transition-colors">
          <div className="text-2xl mb-2">💬</div>
          <h3 className="font-semibold text-stone-900 text-sm">AI Help</h3>
          <p className="text-xs text-stone-400 mt-1">Chat with AI between sessions</p>
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
