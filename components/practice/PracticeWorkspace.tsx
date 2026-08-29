'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { RichContent } from '@/components/visuals/RichContent'
import { useToast } from '@/hooks/useToast'

interface Problem {
  id: string
  question: string
  hint: string
  difficulty: string
  topic: string
}

interface Attempt {
  problemIndex: number
  studentAnswer: string
  correct: boolean | null
}

interface AttemptResult {
  answer: string
  /** null = answered but not graded (no answer key on the problem). */
  correct: boolean | null
  correctAnswer?: string
}

interface PracticeWorkspaceProps {
  practiceSetId: string
  problems: Problem[]
  existingAttempts: Attempt[]
  /** Reports the problem on screen so the side chat can help with it. */
  onCurrentProblemChange?: (problem: Problem | null) => void
}

export function PracticeWorkspace({ practiceSetId, problems, existingAttempts, onCurrentProblemChange }: PracticeWorkspaceProps) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    // Start at the first unanswered problem
    const attempted = new Set(existingAttempts.map((a) => a.problemIndex))
    const first = problems.findIndex((_, i) => !attempted.has(i))
    return first >= 0 ? first : 0
  })
  const { toast } = useToast()
  const [answer, setAnswer] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // `correct: null` is an answered-but-ungraded problem (the set was assigned
  // without an answer key). It counts as answered but never as wrong.
  const [attempts, setAttempts] = useState<Map<number, AttemptResult>>(
    () => {
      const map = new Map<number, AttemptResult>()
      existingAttempts.forEach((a) => {
        map.set(a.problemIndex, { answer: a.studentAnswer, correct: a.correct })
      })
      return map
    }
  )

  const problem = problems[currentIndex]
  const existingResult = attempts.get(currentIndex)

  useEffect(() => {
    onCurrentProblemChange?.(problem ?? null)
  }, [problem, onCurrentProblemChange])

  const answeredCount = attempts.size
  const correctCount = Array.from(attempts.values()).filter((a) => a.correct === true).length
  const gradedCount = Array.from(attempts.values()).filter((a) => a.correct !== null).length
  const allAnswered = problems.length > 0 && answeredCount >= problems.length
  const progressPct = problems.length > 0 ? Math.round((answeredCount / problems.length) * 100) : 0

  const goTo = (i: number) => { setCurrentIndex(i); setAnswer(''); setShowHint(false) }

  const submitAnswer = async () => {
    // The button disables itself while loading, but Enter doesn't go through
    // the button — without this guard a second keypress fires a second request
    // for the same problem.
    if (!answer.trim() || submitting) return
    setSubmitting(true)

    try {
      const res = await fetch(`/api/student/practice/${practiceSetId}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemIndex: currentIndex, studentAnswer: answer }),
      })

      if (res.ok) {
        const data = await res.json()
        setAttempts((prev) => new Map(prev).set(currentIndex, {
          answer,
          correct: data.correct,
          correctAnswer: data.correctAnswer,
        }))
        return
      }

      const data = await res.json().catch(() => ({}))
      // 409 means this problem was already recorded — a double submit, or a
      // retry after a response we never saw. The answer DID land, so showing
      // "failed to submit" was both wrong and unfixable: retrying just 409s
      // again. Reconcile to the stored result instead.
      if (res.status === 409 && data.attempt) {
        setAttempts((prev) => new Map(prev).set(currentIndex, {
          answer: data.attempt.studentAnswer ?? answer,
          correct: data.correct ?? null,
        }))
        return
      }
      toast(data.error || 'Failed to submit answer', 'error')
    } catch {
      toast('Failed to submit answer', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const difficultyColor = {
    easy: 'bg-green-100 text-green-700',
    medium: 'bg-amber-100 text-amber-700',
    hard: 'bg-red-100 text-red-700',
  }[problem?.difficulty] || 'bg-stone-100 text-stone-600'

  if (!problem) return null

  // Score out of what was actually graded — an ungraded problem shouldn't
  // quietly count against the student's percentage.
  const scorePct = gradedCount > 0 ? Math.round((correctCount / gradedCount) * 100) : 0
  const celebration = scorePct >= 80
    ? { emoji: '🎉', title: 'Fantastic work!', msg: 'You crushed this set.' }
    : scorePct >= 50
    ? { emoji: '💪', title: 'Nice progress!', msg: 'Keep practicing to build mastery.' }
    : { emoji: '🌱', title: 'Every rep counts.', msg: 'Mistakes are how mastery grows — try another set.' }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress + score */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm text-stone-500 mb-2">
          <span>{answeredCount} of {problems.length} answered</span>
          <span className="font-medium text-stone-700 tabular-nums">{correctCount} correct</span>
        </div>
        <div className="h-2 rounded-full bg-stone-100 overflow-hidden" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Completion celebration */}
      {allAnswered && (
        <div className="mb-4 animate-pop rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-brand p-6 text-center">
          <div className="text-4xl mb-2" aria-hidden>{celebration.emoji}</div>
          <h2 className="text-xl font-bold">{celebration.title}</h2>
          <p className="text-orange-50 mt-1">{celebration.msg}</p>
          <p className="mt-3 text-3xl font-bold tabular-nums">{correctCount}/{gradedCount || problems.length}</p>
          <Link href="/student/practice">
            <button className="mt-4 bg-white text-orange-600 font-semibold px-6 py-2 rounded-xl shadow-lg shadow-orange-900/10 hover:bg-orange-50 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 text-sm">
              Back to practice sets
            </button>
          </Link>
        </div>
      )}

      {/* Problem number dots */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {problems.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Problem ${i + 1}${
              attempts.has(i)
                ? attempts.get(i)!.correct === true
                  ? ', correct'
                  : attempts.get(i)!.correct === false
                  ? ', incorrect'
                  : ', answered'
                : ''
            }`}
            aria-current={i === currentIndex ? 'true' : undefined}
            className={`w-8 h-8 rounded-full text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
              i === currentIndex
                ? 'bg-orange-500 text-white'
                : attempts.has(i)
                ? attempts.get(i)!.correct === true
                  ? 'bg-green-100 text-green-700'
                  : attempts.get(i)!.correct === false
                  ? 'bg-red-100 text-red-700'
                  : 'bg-stone-200 text-stone-600'
                : 'bg-stone-100 text-stone-500'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Problem Card */}
      <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6">
        <div className="flex items-center justify-between mb-4">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${difficultyColor}`}>
            {problem.difficulty}
          </span>
          <span className="text-xs text-stone-400">{problem.topic}</span>
        </div>

        <div className="text-stone-900 font-medium mb-6 text-lg">
          <RichContent content={problem.question} />
        </div>

        {/* Hint */}
        {problem.hint && (
          <div className="mb-4">
            {showHint ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-800">
                <RichContent content={problem.hint} />
              </div>
            ) : (
              <button
                onClick={() => setShowHint(true)}
                className="text-sm text-orange-500 hover:text-orange-600"
              >
                Show hint
              </button>
            )}
          </div>
        )}

        {/* Answer area */}
        {existingResult ? (
          <div className={`animate-pop rounded-xl px-4 py-3 ${
            existingResult.correct === true
              ? 'bg-green-50 border border-green-200'
              : existingResult.correct === false
              ? 'bg-red-50 border border-red-200'
              : 'bg-stone-50 border border-stone-200'
          }`}>
            <p className="text-sm font-medium mb-1">
              {existingResult.correct === true
                ? '✓ Correct!'
                : existingResult.correct === false
                ? 'Not quite.'
                : 'Answer recorded'}
            </p>
            <p className="text-xs text-stone-500">Your answer: {existingResult.answer}</p>
            {existingResult.correct === false && existingResult.correctAnswer && (
              <div className="text-xs text-stone-500 mt-1">
                Correct answer: <RichContent content={existingResult.correctAnswer} />
              </div>
            )}
            {existingResult.correct === false && (
              <p className="text-xs text-orange-500 mt-2">Keep going — every mistake is a step closer to mastery!</p>
            )}
            {existingResult.correct === null && (
              <p className="text-xs text-stone-500 mt-2">
                This one doesn&apos;t have an answer key yet, so your tutor will check it.
              </p>
            )}
            {currentIndex < problems.length - 1 && (
              <button
                onClick={() => goTo(currentIndex + 1)}
                className="mt-3 text-sm font-semibold text-orange-600 hover:text-orange-700"
              >
                Next problem →
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
              disabled={submitting}
              placeholder="Type your answer..."
              aria-label="Your answer"
              className="flex-1 px-4 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-orange-400 disabled:bg-stone-50 disabled:text-stone-400"
            />
            <Button onClick={submitAnswer} loading={submitting} size="sm">
              Submit
            </Button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => goTo(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
        >
          Previous
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => goTo(Math.min(problems.length - 1, currentIndex + 1))}
          disabled={currentIndex === problems.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
