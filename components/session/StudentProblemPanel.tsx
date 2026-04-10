'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { PracticeProblem } from '@/lib/ai/types'
import type { StudentAnswerResult } from '@/hooks/useLivePracticeSync'

interface StudentProblemPanelProps {
  sessionId: string
  problems: PracticeProblem[]
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
}

export function StudentProblemPanel({
  sessionId,
  problems,
  onAnswerSubmitted,
  onDismiss,
}: StudentProblemPanelProps) {
  const [states, setStates] = useState<Record<string, ProblemState>>({})

  const getState = (id: string): ProblemState =>
    states[id] || { answer: '', submitted: false, correct: null, submitting: false, showHint: false }

  const updateState = (id: string, patch: Partial<ProblemState>) => {
    setStates((prev) => ({ ...prev, [id]: { ...getState(id), ...patch } }))
  }

  const submitAnswer = async (problem: PracticeProblem) => {
    const state = getState(problem.id)
    if (!state.answer.trim() || state.submitted) return

    updateState(problem.id, { submitting: true })
    try {
      const res = await fetch(`/api/tutoring-sessions/${sessionId}/live-practice/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: problem.id,
          answer: state.answer.trim(),
          problemTopic: problem.topic,
          correctAnswer: problem.answer || '',
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
        updateState(problem.id, { submitting: false })
      }
    } catch {
      updateState(problem.id, { submitting: false })
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
          return (
            <div
              key={problem.id}
              className={`rounded-xl border p-3 ${
                state.submitted
                  ? state.correct
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

              {/* Answer input or result */}
              {state.submitted ? (
                <div className={`text-sm ${state.correct ? 'text-green-700' : 'text-red-700'}`}>
                  <p className="font-medium">
                    {state.correct ? 'Correct!' : 'Not quite.'}
                  </p>
                  <p className="text-xs mt-0.5">
                    Your answer: &quot;{state.answer}&quot;
                  </p>
                  {!state.correct && state.correctAnswer && (
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
            Score: {problems.filter((p) => getState(p.id).correct).length} / {problems.length}
          </p>
        </div>
      )}
    </div>
  )
}
