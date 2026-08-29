'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { LivePracticePanel } from './LivePracticePanel'
import { AssessmentPanel } from './AssessmentPanel'
import type { PracticeProblem } from '@/lib/ai/types'
import type { StudentAnswerResult } from '@/hooks/useLivePracticeSync'
import type { DailyCall } from '@daily-co/daily-js'

interface SessionSidebarProps {
  sessionId: string
  initialNotes: string
  problems: PracticeProblem[]
  studentAnswers: Map<string, StudentAnswerResult>
  onProblemsGenerated: (problems: PracticeProblem[]) => void
  onSendToStudent: (problems: PracticeProblem[]) => void
  onClearProblems: () => void
  onOverride: (problemId: string, problemTopic: string) => void
  callFrame: DailyCall | null
  sessionTopic: string
}

export function SessionSidebar({
  sessionId,
  initialNotes,
  problems,
  studentAnswers,
  onProblemsGenerated,
  onSendToStudent,
  onClearProblems,
  onOverride,
  callFrame,
  sessionTopic,
}: SessionSidebarProps) {
  const [tab, setTab] = useState<'notes' | 'practice' | 'assessment'>('notes')
  const [notes, setNotes] = useState(initialNotes)
  // 'unsaved' is a real state, not a transient one: notes only reached the
  // server on blur, so a tutor who typed for an hour and closed the tab lost
  // all of it — and those notes are what the post-session recap and the
  // generated homework are built from when the transcript is thin.
  const [saveState, setSaveState] = useState<'idle' | 'unsaved' | 'saving' | 'saved' | 'error'>('idle')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The value the server has (or is being sent). Lets an autosave skip a
  // no-op write and lets the unmount flush know whether anything is pending.
  const savedValueRef = useRef(initialNotes)
  const notesRef = useRef(initialNotes)
  // Notes are last-write-wins text, so two overlapping PATCHes that resolve out
  // of order leave the server holding the OLDER draft — easy to trigger by
  // blurring the field while a debounced save is already in flight. One request
  // at a time; anything typed meanwhile is picked up by the follow-up pass.
  const inFlightRef = useRef(false)
  const resaveRef = useRef(false)

  const saveNotes = useCallback(async (value: string) => {
    if (value === savedValueRef.current) return
    if (inFlightRef.current) {
      resaveRef.current = true
      return
    }
    inFlightRef.current = true
    setSaveState('saving')
    try {
      const res = await fetch(`/api/tutoring-sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorNotes: value }),
      })
      // A 4xx/5xx used to land here as "Saved" — the tutor was told their
      // notes were safe when the request had been rejected.
      if (!res.ok) {
        setSaveState('error')
        return
      }
      savedValueRef.current = value
      // Don't claim "Saved" if more was typed while this request was in flight.
      setSaveState(notesRef.current === value ? 'saved' : 'unsaved')
    } catch {
      setSaveState('error')
    } finally {
      inFlightRef.current = false
      if (resaveRef.current) {
        resaveRef.current = false
        // Send whatever the field holds now, not the value this call carried.
        void saveNotes(notesRef.current)
      }
    }
  }, [sessionId])

  const handleChange = (value: string) => {
    setNotes(value)
    notesRef.current = value
    setSaveState(value === savedValueRef.current ? 'idle' : 'unsaved')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveNotes(value), 1500)
  }

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    saveNotes(notesRef.current)
  }, [saveNotes])

  // Leaving the field saves immediately rather than waiting out the debounce.
  const handleBlur = () => flush()

  // Last-chance flush when the panel goes away (tab switch away from the
  // session, end of call). Fire-and-forget — nothing can await here.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (notesRef.current !== savedValueRef.current) {
      const body = JSON.stringify({ tutorNotes: notesRef.current })
      // keepalive lets the request outlive the unmount/navigation.
      fetch(`/api/tutoring-sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* best effort */ })
    }
  }, [sessionId])

  return (
    <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-4 h-full flex flex-col">
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
        <button
          onClick={() => setTab('assessment')}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
            tab === 'assessment'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          Assessment
        </button>
      </div>

      {/* Tab content */}
      {tab === 'notes' ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-stone-900 text-sm">Session Notes</h3>
            {saveState === 'error' ? (
              <button
                onClick={flush}
                className="text-xs font-medium text-red-600 hover:text-red-700"
              >
                Not saved — retry
              </button>
            ) : (
              <span
                className="text-xs text-stone-400"
                aria-live="polite"
              >
                {saveState === 'saving'
                  ? 'Saving…'
                  : saveState === 'unsaved'
                  ? 'Unsaved'
                  : saveState === 'saved'
                  ? 'Saved'
                  : ''}
              </span>
            )}
          </div>
          <textarea
            value={notes}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            placeholder="Type your session notes here..."
            className="flex-1 w-full resize-none text-sm text-stone-700 placeholder:text-stone-300 focus:outline-none"
          />
        </div>
      ) : tab === 'practice' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <LivePracticePanel
            sessionId={sessionId}
            problems={problems}
            studentAnswers={studentAnswers}
            onProblemsGenerated={onProblemsGenerated}
            onSendToStudent={onSendToStudent}
            onClear={onClearProblems}
            onOverride={onOverride}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AssessmentPanel sessionId={sessionId} callFrame={callFrame} defaultTopic={sessionTopic} />
        </div>
      )}
    </div>
  )
}
