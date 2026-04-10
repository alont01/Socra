'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { StudentRoster } from './StudentRoster'
import { UpcomingSessionsPanel } from './UpcomingSessionsPanel'
import { LoadingDots } from '@/components/ui/LoadingDots'

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
        body: JSON.stringify({
          topic: newTopic || 'Math Session',
          studentId: newStudentId || undefined,
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
      <div className="flex justify-center py-12">
        <LoadingDots />
      </div>
    )
  }

  return (
    <>
      {/* Welcome banner */}
      <div className="bg-orange-500 rounded-2xl p-6 text-white mb-8">
        <h1 className="text-2xl font-bold">Welcome back, {tutorName}!</h1>
        <p className="text-orange-100 mt-1">
          {students.length} student{students.length !== 1 ? 's' : ''} · {sessions.filter((s) => s.status !== 'cancelled').length} session{sessions.length !== 1 ? 's' : ''}
        </p>
        <Button
          variant="secondary"
          className="mt-4 bg-white text-orange-600 hover:bg-orange-50"
          onClick={() => setShowNewSession(true)}
        >
          New Session +
        </Button>
      </div>

      {/* New Session form */}
      {showNewSession && (
        <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5 mb-6">
          <h3 className="font-semibold text-stone-900 mb-3">Create Session</h3>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Topic (e.g. Fractions)"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-orange-400"
            />
            <select
              value={newStudentId}
              onChange={(e) => setNewStudentId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-orange-400"
            >
              <option value="">No student (open)</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Button onClick={createSession} loading={creating} size="sm">Start</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowNewSession(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roster — left */}
        <div className="lg:col-span-1">
          <StudentRoster
            students={students}
            onStudentAdded={(s) => setStudents((prev) => [s, ...prev])}
            onStudentRemoved={(id) => setStudents((prev) => prev.filter((s) => s.id !== id))}
          />
        </div>

        {/* Sessions — right */}
        <div className="lg:col-span-2">
          <h2 className="font-bold text-stone-900 mb-4">Sessions</h2>
          <UpcomingSessionsPanel sessions={sessions} role="TUTOR" />
        </div>
      </div>
    </>
  )
}
