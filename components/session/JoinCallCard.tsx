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
      <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 ring-1 ring-orange-100 flex items-center justify-center text-orange-600 mx-auto mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
            <path d="M4 8a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Zm11 3 4-2.5v7L15 13" />
          </svg>
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
