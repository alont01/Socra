'use client'

import { useState, useCallback } from 'react'
import { LivePracticePanel } from './LivePracticePanel'
import type { PracticeProblem } from '@/lib/ai/types'
import type { StudentAnswerResult } from '@/hooks/useLivePracticeSync'

interface SessionSidebarProps {
  sessionId: string
  initialNotes: string
  problems: PracticeProblem[]
  studentAnswers: Map<string, StudentAnswerResult>
  onProblemsGenerated: (problems: PracticeProblem[]) => void
  onSendToStudent: (problems: PracticeProblem[]) => void
  onClearProblems: () => void
}

export function SessionSidebar({
  sessionId,
  initialNotes,
  problems,
  studentAnswers,
  onProblemsGenerated,
  onSendToStudent,
  onClearProblems,
}: SessionSidebarProps) {
  const [tab, setTab] = useState<'notes' | 'practice'>('notes')
  const [notes, setNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  const saveNotes = useCallback(async (value: string) => {
    setSaving(true)
    try {
      await fetch(`/api/tutoring-sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorNotes: value }),
      })
      setLastSaved(new Date())
    } finally {
      setSaving(false)
    }
  }, [sessionId])

  const handleBlur = () => {
    saveNotes(notes)
  }

  return (
    <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-4 h-full flex flex-col">
      {/* Tab switcher */}
      <div className="flex bg-stone-100 rounded-lg p-0.5 mb-3">
        <button
          onClick={() => setTab('notes')}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
            tab === 'notes'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          Notes
        </button>
        <button
          onClick={() => setTab('practice')}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
            tab === 'practice'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          Practice
        </button>
      </div>

      {/* Tab content */}
      {tab === 'notes' ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-stone-900 text-sm">Session Notes</h3>
            <span className="text-xs text-stone-400">
              {saving ? 'Saving...' : lastSaved ? 'Saved' : ''}
            </span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleBlur}
            placeholder="Type your session notes here..."
            className="flex-1 w-full resize-none text-sm text-stone-700 placeholder:text-stone-300 focus:outline-none"
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <LivePracticePanel
            sessionId={sessionId}
            problems={problems}
            studentAnswers={studentAnswers}
            onProblemsGenerated={onProblemsGenerated}
            onSendToStudent={onSendToStudent}
            onClear={onClearProblems}
          />
        </div>
      )}
    </div>
  )
}
