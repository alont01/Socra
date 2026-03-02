'use client'

import { Button } from '@/components/ui/Button'

interface JoinCallCardProps {
  topic: string
  studentName: string | null
  tutorName: string
  status: string
  isTutor: boolean
  onJoin: () => void
  onStart: () => void
  joining: boolean
}

export function JoinCallCard({ topic, studentName, tutorName, status, isTutor, onJoin, onStart, joining }: JoinCallCardProps) {
  const isScheduled = status === 'scheduled'

  return (
    <div className="max-w-md mx-auto text-center">
      <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-8">
        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl mx-auto mb-4">
          📹
        </div>

        <h2 className="text-xl font-bold text-stone-900 mb-2">{topic || 'Math Session'}</h2>

        <div className="text-sm text-stone-500 mb-6">
          {isTutor ? (
            studentName ? `Session with ${studentName}` : 'Open session (no student assigned)'
          ) : (
            `Session with ${tutorName}`
          )}
        </div>

        {isTutor && isScheduled ? (
          <Button size="lg" className="w-full" onClick={onStart} loading={joining}>
            Start Session
          </Button>
        ) : status === 'active' ? (
          <Button size="lg" className="w-full" onClick={onJoin} loading={joining}>
            Join Session
          </Button>
        ) : status === 'completed' ? (
          <p className="text-stone-500">This session has ended.</p>
        ) : null}
      </div>
    </div>
  )
}
