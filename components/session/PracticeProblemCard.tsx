'use client'

import { useState } from 'react'
import MathRenderer from '@/components/MathRenderer'
import type { PracticeProblem } from '@/lib/ai/types'

interface PracticeProblemCardProps {
  problem: PracticeProblem
  sessionId: string
}

const DIFFICULTY_STYLES = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-orange-100 text-orange-700',
}

export function PracticeProblemCard({ problem, sessionId }: PracticeProblemCardProps) {
  const [showHint, setShowHint] = useState(false)
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    if (!answer.trim() || submitted) return
    setSubmitted(true)

    fetch(`/api/sessions/${sessionId}/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem, studentAnswer: answer }),
    }).catch((err) => console.error('Failed to record attempt:', err))
  }

  return (
    <div className="border border-orange-100 rounded-xl bg-orange-50/40 p-4 text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${DIFFICULTY_STYLES[problem.difficulty]}`}
        >
          {problem.difficulty}
        </span>
        <span className="text-xs text-stone-500">{problem.topic}</span>
      </div>

      {/* Question */}
      <div className="text-stone-800 mb-3 prose-math">
        <MathRenderer content={problem.question} />
      </div>

      {/* Hint */}
      <div className="mb-3">
        <button
          onClick={() => setShowHint((v) => !v)}
          className="text-xs text-orange-600 hover:text-orange-700 font-medium transition-colors"
        >
          {showHint ? 'Hide hint ▲' : 'Show hint ▼'}
        </button>
        {showHint && (
          <div className="mt-2 text-xs text-stone-600 bg-orange-50 border border-orange-100 rounded-lg p-2 prose-math">
            <MathRenderer content={problem.hint} />
          </div>
        )}
      </div>

      {/* Answer input */}
      {!submitted ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Your answer…"
            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white text-stone-900 placeholder-stone-400"
          />
          <button
            onClick={handleSubmit}
            disabled={!answer.trim()}
            className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold disabled:opacity-40 hover:bg-orange-600 transition-colors"
          >
            Submit
          </button>
        </div>
      ) : (
        <p className="text-xs text-stone-500 bg-white border border-orange-100 rounded-lg px-3 py-2">
          Answer recorded. Ask Socra to check it!
        </p>
      )}
    </div>
  )
}
