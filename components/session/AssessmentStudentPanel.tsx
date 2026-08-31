'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RichContent } from '@/components/visuals/RichContent'
import { Button } from '@/components/ui/Button'
import { useAssessmentSync } from '@/hooks/useAssessmentSync'
import { fetchWithTimeout, isTimeoutError } from '@/lib/client-fetch-timeout'
import type { AssessmentData } from '@/types'
import type { DailyCall } from '@daily-co/daily-js'

// Grading calls generateAssessmentItem for the next problem — an AI call with
// no server-side deadline (lib/ai/client.ts). Without a client-side ceiling a
// stuck provider leaves Submit spinning indefinitely with no way out.
const ASSESSMENT_TIMEOUT_MS = 45_000

interface AssessmentStudentPanelProps {
  sessionId: string
  callFrame: DailyCall | null
  // Lets the parent avoid reserving sidebar width when there's no active
  // assessment to show (this panel renders null in that case).
  onActiveChange?: (active: boolean) => void
}

export function AssessmentStudentPanel({ sessionId, callFrame, onActiveChange }: AssessmentStudentPanelProps) {
  const [assessment, setAssessment] = useState<AssessmentData | null | undefined>(undefined)
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // Feedback for the just-answered item, shown until the student continues —
  // so the reveal isn't skipped past when the next question is already ready.
  const [feedback, setFeedback] = useState<{ correct: boolean; correctAnswer?: string } | null>(null)

  // Returns the freshly-loaded assessment (or undefined on failure) so a
  // caller reconciling after a failed submit can tell whether the item it
  // just tried to answer actually moved on server-side.
  const load = useCallback(async (): Promise<AssessmentData | null | undefined> => {
    try {
      const res = await fetch(`/api/tutoring-sessions/${sessionId}/assessment`)
      if (res.ok) {
        const data = await res.json()
        setAssessment(data.assessment)
        return data.assessment
      }
    } catch {
      /* keep previous state on a transient failure */
    }
    return undefined
  }, [sessionId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (assessment !== undefined) onActiveChange?.(!!assessment)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment])

  // A 'changed' signal arriving while the feedback screen is up used to be
  // dropped outright, so a tutor override or an early end during that window
  // left the student on stale state indefinitely. Defer it instead: remember
  // that a refresh is owed and run it when they continue.
  const pendingReloadRef = useRef(false)

  const { notifyChanged, notifyGenerating } = useAssessmentSync({
    callFrame,
    isTutor: false,
    onChanged: useCallback(() => {
      if (feedback) pendingReloadRef.current = true
      else load()
    }, [load, feedback]),
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assessment?.currentItem || !answer.trim() || submitting) return
    const attemptedItemId = assessment.currentItem.id
    setSubmitting(true)
    setError('')
    // The tutor can't see this request. Tell them the wait has started now,
    // rather than leaving their panel claiming the student hasn't answered.
    notifyGenerating()

    // Re-fetch after a failure and reconcile against what actually landed
    // server-side. The item is claimed atomically BEFORE the route replies, so
    // a lost response (a timeout, a network blip, a duplicate submit racing a
    // retry) can mean the answer was graded and the assessment moved on even
    // though this request errored. Without this, the student was stuck on the
    // already-answered question forever: retrying always 409s, and nothing
    // else re-fetches while an error is showing.
    const reconcile = async (message: string) => {
      notifyChanged()
      const fresh = await load()
      // Only keep the error on screen if the item we tried to answer is still
      // the current one — otherwise the submission actually succeeded and
      // showing "could not submit" under the NEW question would be a lie.
      if (fresh?.currentItem?.id === attemptedItemId) setError(message)
    }

    try {
      const res = await fetchWithTimeout(`/api/tutoring-sessions/${sessionId}/assessment/${assessment.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: attemptedItemId, answer: answer.trim() }),
      }, ASSESSMENT_TIMEOUT_MS)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        await reconcile(data.error || 'Could not submit your answer.')
        return
      }
      setAssessment(data.assessment)
      setFeedback(data.justAnswered)
      setAnswer('')
      // The next problem (or the holistic result, if this was the last one)
      // now exists — tell the tutor's panel to re-fetch. Without this the
      // tutor's view is stuck on "writing the next problem…" until the
      // 90s timeout clears the bar, then reverts to "waiting to answer"
      // forever, even though grading and mastery are already correct
      // server-side.
      notifyChanged()
    } catch (err) {
      await reconcile(
        isTimeoutError(err)
          ? 'This is taking longer than expected. Please try again.'
          : 'Network error — check your connection.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const continueOn = () => {
    setFeedback(null)
    if (pendingReloadRef.current) {
      pendingReloadRef.current = false
      load()
    }
  }

  // Quiet by default: render nothing until the tutor actually starts an
  // assessment (matches how the regular practice panel only appears once
  // problems exist), rather than taking up sidebar space all session.
  if (assessment === undefined || !assessment) return null

  if (assessment.status === 'completed') {
    return (
      <div className="bg-white rounded-2xl border border-orange-200 shadow-lg p-5 text-center">
        <div className="mx-auto mb-2 grid place-items-center h-10 w-10 rounded-full bg-green-100 text-green-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h3 className="font-semibold text-stone-900 text-sm">Assessment complete!</h3>
        <p className="text-xs text-stone-500 mt-1">Nice work — your tutor will go over the results with you.</p>
      </div>
    )
  }

  if (feedback) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 shadow-lg p-5 text-center">
        <div className={`mx-auto mb-2 grid place-items-center h-10 w-10 rounded-full ${feedback.correct ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
          {feedback.correct ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
          )}
        </div>
        <h3 className="font-semibold text-stone-900 text-sm">{feedback.correct ? 'Correct!' : 'Not quite'}</h3>
        {!feedback.correct && feedback.correctAnswer && (
          <p className="text-xs text-stone-500 mt-1">The answer was <span className="font-mono">{feedback.correctAnswer}</span></p>
        )}
        <Button size="sm" className="mt-3" onClick={continueOn}>
          {assessment.status === 'in_progress' && assessment.currentItem ? 'Next problem →' : 'Continue'}
        </Button>
      </div>
    )
  }

  if (!assessment.currentItem) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 text-sm text-stone-400 text-center">
        Waiting for your next problem…
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-orange-200 shadow-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-stone-400">Problem {assessment.currentItem.index} of up to {assessment.maxItems}</span>
      </div>
      <div className="text-sm text-stone-800 mb-3"><RichContent content={assessment.currentItem.question} /></div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer"
          autoFocus
          className="flex-1 rounded-xl ring-1 ring-inset ring-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <Button type="submit" size="sm" loading={submitting} disabled={!answer.trim()}>Submit</Button>
      </form>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
