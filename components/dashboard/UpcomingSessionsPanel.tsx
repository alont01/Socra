'use client'

import Link from 'next/link'

interface TutoringSessionItem {
  id: string
  topic: string
  status: string
  scheduledAt: string | null
  createdAt: string
  student?: { id: string; name: string; gradeLevel?: string } | null
  tutor?: { id: string; name: string } | null
}

interface UpcomingSessionsPanelProps {
  sessions: TutoringSessionItem[]
  role: 'TUTOR' | 'STUDENT'
}

function statusBadge(status: string) {
  switch (status) {
    case 'active':
      return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Live</span>
    case 'completed':
      return <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-medium">Completed</span>
    case 'cancelled':
      return <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Cancelled</span>
    default:
      return <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Scheduled</span>
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'No date set'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function UpcomingSessionsPanel({ sessions, role }: UpcomingSessionsPanelProps) {
  if (sessions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-8 text-center">
        <p className="text-stone-500 mb-2">No sessions yet.</p>
        {role === 'TUTOR' && (
          <p className="text-sm text-stone-400">Create one to get started.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <Link key={s.id} href={s.status === 'completed' ? `/session/${s.id}/review` : `/session/${s.id}`}>
          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-4 hover:border-orange-300 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-medium text-stone-900 text-sm">
                {s.topic || 'Untitled Session'}
              </h4>
              {statusBadge(s.status)}
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-400">
              {role === 'TUTOR' && s.student && <span>with {s.student.name}</span>}
              {role === 'STUDENT' && s.tutor && <span>with {s.tutor.name}</span>}
              <span>{formatDate(s.scheduledAt || s.createdAt)}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
