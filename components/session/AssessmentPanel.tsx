'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RichContent } from '@/components/visuals/RichContent'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useAssessmentSync } from '@/hooks/useAssessmentSync'
import { fetchWithTimeout, isTimeoutError } from '@/lib/client-fetch-timeout'
import type { AssessmentData } from '@/types'
import type { DailyCall } from '@daily-co/daily-js'

// Starting generates the first item — an AI call with no server-side deadline
// (lib/ai/client.ts). Without a client-side ceiling a stuck provider leaves
// "Start assessment" spinning indefinitely with no way out.
const ASSESSMENT_TIMEOUT_MS = 45_000

interface AssessmentPanelProps {
  sessionId: string
  callFrame: DailyCall | null
  defaultTopic: string
}

const LADDER = Array.from({ length: 10 }, (_, i) => i + 1)

function outcomeBadge(outcome: string | null) {
  if (outcome === 'correct') return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Correct</span>
  if (outcome === 'incorrect') return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Incorrect</span>
  if (outcome === 'worked_together') return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Worked together</span>
  return null
}

export function AssessmentPanel({ sessionId, callFrame, defaultTopic }: AssessmentPanelProps) {
  const [assessment, setAssessment] = useState<AssessmentData | null | undefined>(undefined) // undefined = loading
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [gradingId, setGradingId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  // A failure on the very first load left the panel on "Loading…" forever —
  // there was no previous state to fall back to and nothing else re-triggers
  // `load()` besides a student broadcast. Only meaningful pre-first-success;
  // a transient failure on a later background refresh just keeps the current
  // view rather than replacing it with an error screen.
  const [loadFailed, setLoadFailed] = useState(false)
  const hasLoadedRef = useRef(false)
  const generatingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tutoring-sessions/${sessionId}/assessment`)
      if (res.ok) {
        const data = await res.json()
        setAssessment(data.assessment)
        setLoadFailed(false)
        hasLoadedRef.current = true
        return
      }
      if (!hasLoadedRef.current) setLoadFailed(true)
    } catch {
      if (!hasLoadedRef.current) setLoadFailed(true)
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  // The student's submit broadcasts 'generating'; the next problem landing
  // broadcasts 'changed'. If the student's request dies mid-flight the second
  // signal never comes, so the bar is also on a timer — a progress bar that
  // never resolves is worse than none.
  const clearGenerating = useCallback(() => {
    if (generatingTimeout.current) clearTimeout(generatingTimeout.current)
    generatingTimeout.current = null
    setGenerating(false)
  }, [])

  const { notifyChanged } = useAssessmentSync({
    callFrame,
    isTutor: true,
    onChanged: useCallback(() => { clearGenerating(); load() }, [load, clearGenerating]),
    onGenerating: useCallback(() => {
      setGenerating(true)
      if (generatingTimeout.current) clearTimeout(generatingTimeout.current)
      generatingTimeout.current = setTimeout(() => setGenerating(false), 90_000)
    }, []),
  })

  useEffect(() => () => {
    if (generatingTimeout.current) clearTimeout(generatingTimeout.current)
  }, [])

  const start = async () => {
    setStarting(true)
    setError('')
    try {
      const res = await fetchWithTimeout(`/api/tutoring-sessions/${sessionId}/assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: defaultTopic }),
      }, ASSESSMENT_TIMEOUT_MS)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not start the assessment.'); return }
      setAssessment(data.assessment)
      notifyChanged()
    } catch (err) {
      setError(
        isTimeoutError(err)
          ? 'This is taking longer than expected. Please try again.'
          : 'Network error — could not start the assessment.',
      )
    } finally {
      setStarting(false)
    }
  }

  // These both record something the tutor is telling the student is true, so a
  // silent no-op is the worst outcome: the button looks dead, and the grade the
  // tutor believes they applied never reached the record that drives mastery.
  const override = async (itemId: string, tutorResult: 'correct' | 'incorrect' | 'worked_together') => {
    if (!assessment) return
    setGradingId(itemId)
    setError('')
    try {
      const res = await fetch(`/api/tutoring-sessions/${sessionId}/assessment/${assessment.id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, tutorResult }),
      })
      if (res.ok) {
        const data = await res.json()
        setAssessment(data.assessment)
        notifyChanged()
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'That grade could not be saved. Try again.')
    } catch {
      setError('Network error — that grade was not saved.')
    } finally {
      setGradingId(null)
    }
  }

  const end = async () => {
    if (!assessment) return
    setEnding(true)
    setError('')
    try {
      // Ending runs the same AI holistic-summary call as everything else in
      // this file — this was the one action here still on a plain fetch, so a
      // stuck provider left the button spinning with no way out while the
      // student's Submit 409s "already ended" for as long as it hung.
      const res = await fetchWithTimeout(
        `/api/tutoring-sessions/${sessionId}/assessment/${assessment.id}/end`,
        { method: 'POST' },
        ASSESSMENT_TIMEOUT_MS,
      )
      if (res.ok) {
        const data = await res.json()
        setAssessment(data.assessment)
        notifyChanged()
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not end the assessment. Try again.')
    } catch (err) {
      setError(
        isTimeoutError(err)
          ? 'This is taking longer than expected. Please try again.'
          : 'Network error — the assessment is still running.',
      )
    } finally {
      setEnding(false)
    }
  }

  if (assessment === undefined) {
    if (loadFailed) {
      return (
        <div className="p-4 space-y-2 text-center">
          <p className="text-sm text-stone-500">Couldn&apos;t load the assessment.</p>
          <button onClick={load} className="text-sm font-medium text-orange-600 hover:text-orange-700">
            Try again
          </button>
        </div>
      )
    }
    return <div className="p-4 text-sm text-stone-400">Loading…</div>
  }

  if (!assessment) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-sm text-stone-500">
          Give {defaultTopic ? `a ${defaultTopic} ` : 'a '}diagnostic assessment: one problem at a time, difficulty adjusts to how the student does, up to 10 problems.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={start} loading={starting} size="sm">Start assessment</Button>
        <ProgressBar active={starting} estimatedMs={15000} label="Writing the first problem…" />
      </div>
    )
  }

  const answeredItems = assessment.items.filter((it) => it.answered || it.tutorResult)

  return (
    <div className="p-4 space-y-4">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">{error}</p>
      )}

      {/* Ladder */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-stone-500">Difficulty level</span>
          <span className="text-xs font-semibold text-stone-700">{assessment.currentLevel} / 10</span>
        </div>
        <div className="flex gap-1">
          {LADDER.map((lvl) => (
            <div
              key={lvl}
              className={`h-2 flex-1 rounded-full ${lvl <= assessment.currentLevel ? 'bg-orange-500' : 'bg-stone-100'}`}
            />
          ))}
        </div>
        <p className="text-xs text-stone-400 mt-1">{assessment.itemCount} / {assessment.maxItems} problems</p>
      </div>

      {/* Completed: holistic result */}
      {assessment.status === 'completed' && assessment.result && (
        <div className="rounded-2xl bg-orange-50 ring-1 ring-orange-100 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-stone-900">Assessment complete</h4>
            {assessment.result.estimatedLevel != null && (
              <span className="text-xs font-semibold text-orange-700">Level {assessment.result.estimatedLevel}/10</span>
            )}
          </div>
          {assessment.result.summary && <p className="text-sm text-stone-600">{assessment.result.summary}</p>}
          {assessment.result.strengths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1">Strengths</p>
              <div className="flex flex-wrap gap-1.5">
                {assessment.result.strengths.map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{s}</span>
                ))}
              </div>
            </div>
          )}
          {assessment.result.gaps.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1">Gaps to target</p>
              <div className="flex flex-wrap gap-1.5">
                {assessment.result.gaps.map((g) => (
                  <span key={g} className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{g}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current item (in progress) */}
      {assessment.status === 'in_progress' && assessment.currentItem && (
        <div className="rounded-2xl ring-1 ring-stone-200 p-3.5">
          <p className="text-xs text-stone-400 mb-1.5">Problem {assessment.currentItem.index} · {assessment.currentItem.topic}</p>
          <div className="text-sm text-stone-800"><RichContent content={assessment.currentItem.question} /></div>
          {assessment.currentItem.answer && (
            <p className="text-xs text-stone-400 mt-2">Answer: <span className="font-mono text-stone-600">{assessment.currentItem.answer}</span></p>
          )}
          {!generating && <p className="text-xs text-stone-400 mt-2 italic">Waiting for the student to answer…</p>}
        </div>
      )}

      {/* The student has answered and the next problem is being written. This
          window belongs to the model, not the student — say so. */}
      <ProgressBar
        active={generating}
        estimatedMs={15000}
        label="Student answered — writing the next problem…"
      />

      {assessment.status === 'in_progress' && (
        <Button variant="ghost" size="sm" onClick={end} loading={ending}>End assessment now</Button>
      )}

      {/* History */}
      {answeredItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-stone-500">History</p>
          {answeredItems.map((it) => (
            <div key={it.id} className="rounded-xl bg-stone-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs text-stone-400">#{it.index} · Level {it.level} · {it.topic}</span>
                {outcomeBadge(it.outcome)}
              </div>
              <div className="text-stone-700 text-sm mb-1"><RichContent content={it.question} /></div>
              <p className="text-xs text-stone-500">
                Student answered: <span className="font-mono">{it.studentAnswer || '—'}</span>
                {it.answer && <> · Correct: <span className="font-mono">{it.answer}</span></>}
              </p>
              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={() => override(it.id, 'correct')}
                  disabled={gradingId === it.id}
                  className={`text-xs px-2 py-1 rounded-lg ring-1 ring-inset ${it.outcome === 'correct' ? 'bg-green-100 ring-green-200 text-green-700' : 'ring-stone-200 text-stone-500 hover:bg-stone-100'}`}
                >
                  Mark correct
                </button>
                <button
                  onClick={() => override(it.id, 'incorrect')}
                  disabled={gradingId === it.id}
                  className={`text-xs px-2 py-1 rounded-lg ring-1 ring-inset ${it.outcome === 'incorrect' ? 'bg-red-100 ring-red-200 text-red-700' : 'ring-stone-200 text-stone-500 hover:bg-stone-100'}`}
                >
                  Mark incorrect
                </button>
                <button
                  onClick={() => override(it.id, 'worked_together')}
                  disabled={gradingId === it.id}
                  className={`text-xs px-2 py-1 rounded-lg ring-1 ring-inset ${it.outcome === 'worked_together' ? 'bg-amber-100 ring-amber-200 text-amber-700' : 'ring-stone-200 text-stone-500 hover:bg-stone-100'}`}
                >
                  Worked together
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
