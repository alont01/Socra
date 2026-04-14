'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { PracticeProblem } from '@/lib/ai/types'
import type { StudentAnswerResult } from '@/hooks/useLivePracticeSync'

interface StudentProblemPanelProps {
  sessionId: string
  problems: PracticeProblem[]
  overrides: Set<string>
  onAnswerSubmitted: (result: StudentAnswerResult) => void
  onDismiss: () => void
}

interface ProblemState {
  answer: string
  submitted: boolean
  correct: boolean | null
  correctAnswer?: string
  submitting: boolean
  showHint: boolean
  error?: string
}

export function StudentProblemPanel({
  sessionId,
  problems,
  overrides,
  onAnswerSubmitted,
  onDismiss,
}: StudentProblemPanelProps) {
  const [states, setStates] = useState<Record<string, ProblemState>>({})

  const defaultState: ProblemState = { answer: '', submitted: false, correct: null, submitting: false, showHint: false, error: undefined }

  const getState = (id: string): ProblemState =>
    states[id] || defaultState

  const updateState = (id: string, patch: Partial<ProblemState>) => {
    setStates((prev) => {
      const current = prev[id] || defaultState
      return { ...prev, [id]: { ...current, ...patch } }
    })
  }

  const submitAnswer = async (problem: PracticeProblem) => {
    const state = getState(problem.id)
    if (!state.answer.trim() || state.submitted) return

    updateState(problem.id, { submitting: true, error: undefined })
    try {
      const res = await fetch(`/api/tutoring-sessions/${sessionId}/live-practice/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: problem.id,
          answer: state.answer.trim(),
          answerToken: problem.answerToken || '',
        }),
      })

      if (res.ok) {
        const data = await res.json()
        updateState(problem.id, {
          submitted: true,
          correct: data.correct,
          correctAnswer: data.correctAnswer,
          submitting: false,
        })
        onAnswerSubmitted({
          problemId: problem.id,
          answer: state.answer.trim(),
          correct: data.correct,
        })
      } else {
        const errData = await res.json().catch(() => ({ error: 'Something went wrong' }))
        updateState(problem.id, { submitting: false, error: errData.error || `Error (${res.status})` })
      }
    } catch {
      updateState(problem.id, { submitting: false, error: 'Network error — check your connection' })
    }
  }

  const allAnswered = problems.length > 0 && problems.every((p) => getState(p.id).submitted)

  return (
    <div className="bg-white rounded-2xl border border-orange-200 shadow-lg p-4 flex flex-col max-h-[70vh] overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-stone-900 text-sm">Practice Problems</h3>
        {allAnswered && (
          <button
            onClick={onDismiss}
            className="text-xs text-stone-400 hover:text-stone-600"
          >
            Dismiss
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {problems.map((problem, idx) => {
          const state = getState(problem.id)
          const overridden = overrides.has(problem.id)
          const isCorrect = state.correct || overridden
          return (
            <div
              key={problem.id}
              className={`rounded-xl border p-3 ${
                state.submitted
                  ? isCorrect
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
                  : 'border-stone-200 bg-stone-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-stone-500">#{idx + 1}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  problem.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                  problem.difficulty === 'hard' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {problem.difficulty}
                </span>
              </div>

              <p className="text-sm text-stone-800 mb-2">{problem.question}</p>

              {/* Hint toggle */}
              {problem.hint && !state.submitted && (
                <div className="mb-2">
                  <button
                    onClick={() => updateState(problem.id, { showHint: !state.showHint })}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    {state.showHint ? 'Hide hint' : 'Show hint'}
                  </button>
                  {state.showHint && (
                    <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-2 py-1.5 mt-1">
                      {problem.hint}
                    </p>
                  )}
                </div>
              )}

              {/* Error message */}
              {state.error && (
                <p className="text-xs text-red-500 mb-2">{state.error}</p>
              )}

              {/* Answer input or result */}
              {state.submitted ? (
                <div className={`text-sm ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                  <p className="font-medium">
                    {overridden ? 'Marked correct by tutor' : state.correct ? 'Correct!' : 'Not quite.'}
                  </p>
                  <p className="text-xs mt-0.5">
                    Your answer: &quot;{state.answer}&quot;
                  </p>
                  {!isCorrect && state.correctAnswer && (
                    <p className="text-xs mt-0.5">
                      Correct answer: {state.correctAnswer}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={state.answer}
                    onChange={(e) => updateState(problem.id, { answer: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitAnswer(problem)
                    }}
                    placeholder="Your answer..."
                    className="flex-1 px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200"
                  />
                  <Button
                    onClick={() => submitAnswer(problem)}
                    loading={state.submitting}
                    size="sm"
                    disabled={!state.answer.trim()}
                  >
                    Submit
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Score summary */}
      {allAnswered && (
        <div className="mt-3 pt-3 border-t border-stone-100 text-center">
          <p className="text-sm font-medium text-stone-700">
            Score: {problems.filter((p) => getState(p.id).correct || overrides.has(p.id)).length} / {problems.length}
          </p>
        </div>
      )}
    </div>
  )
}
