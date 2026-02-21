'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/Button'
import { SessionCard } from '@/components/dashboard/SessionCard'
import { LearningPlanPanel } from '@/components/dashboard/LearningPlanPanel'
import { LoadingDots } from '@/components/ui/LoadingDots'

interface Session {
  id: string
  title: string
  topic: string
  createdAt: string
  updatedAt: string
  _count: { messages: number }
  messages: Array<{ content: string; role: string }>
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth')
    }
  }, [user, loading, router])

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch('/api/sessions')
        if (res.ok) {
          const data = await res.json()
          setSessions(data.sessions)
        }
      } finally {
        setSessionsLoading(false)
      }
    }
    if (user) fetchSessions()
  }, [user])

  const startSession = async () => {
    setCreating(true)
    try {
      const topicSuggestion =
        user?.studentProfile
          ? JSON.parse(user.studentProfile.mathTopics || '[]')[0] || 'Math'
          : 'Math'

      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${topicSuggestion} Session`,
          topic: topicSuggestion,
        }),
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
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <LoadingDots />
      </div>
    )
  }

  const studentName = user?.studentProfile?.name || user?.parentProfile?.name || 'there'
  const isParent = user?.role === 'PARENT'
  const learningPlan = user?.studentProfile?.learningPlan || ''

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Welcome banner */}
        <div className="bg-orange-500 rounded-2xl p-6 text-white mb-8">
          <h1 className="text-2xl font-bold">
            {isParent ? `Welcome back, ${studentName}!` : `Hey ${studentName}! 👋`}
          </h1>
          <p className="text-orange-100 mt-1">
            {isParent
              ? 'Manage your children\'s math progress here.'
              : user?.studentProfile?.goals
              ? `Goal: ${user.studentProfile.goals}`
              : 'Ready to explore some math today?'}
          </p>
          {!isParent && (
            <Button
              variant="secondary"
              className="mt-4 bg-white text-orange-600 hover:bg-orange-50"
              onClick={startSession}
              loading={creating}
            >
              Start Today&apos;s Session →
            </Button>
          )}
        </div>

        {isParent ? (
          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-8 text-center">
            <div className="text-4xl mb-4">👨‍👩‍👧</div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">Parent Dashboard</h2>
            <p className="text-stone-500 mb-6">
              As a parent, you can monitor your child&apos;s progress. Child management features coming soon!
            </p>
            <Link href="/auth">
              <Button variant="secondary">Add a Child</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Learning Plan — left 1/3 */}
            <div className="lg:col-span-1">
              <LearningPlanPanel planJson={learningPlan} />
            </div>

            {/* Sessions — right 2/3 */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-stone-900">Recent Sessions</h2>
                <Button size="sm" onClick={startSession} loading={creating}>
                  + New Session
                </Button>
              </div>

              {sessionsLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingDots />
                </div>
              ) : sessions.length === 0 ? (
                <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-8 text-center">
                  <div className="text-4xl mb-3">📝</div>
                  <p className="text-stone-500 mb-4">No sessions yet. Start your first one!</p>
                  <Button onClick={startSession} loading={creating}>
                    Start First Session →
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((s) => (
                    <SessionCard key={s.id} session={s} />
                  ))}
                </div>
              )}

              {/* Stats row */}
              {sessions.length > 0 && (
                <div className="grid grid-cols-3 gap-4 mt-6">
                  {[
                    { label: 'Sessions', value: sessions.length },
                    {
                      label: 'Topics',
                      value: new Set(sessions.map((s) => s.topic).filter(Boolean)).size,
                    },
                    {
                      label: 'Messages',
                      value: sessions.reduce((a, s) => a + (s._count?.messages || 0), 0),
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="bg-white rounded-2xl border border-orange-100 shadow-sm p-4 text-center"
                    >
                      <div className="text-2xl font-bold text-orange-500">{stat.value}</div>
                      <div className="text-xs text-stone-500 mt-1">{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
