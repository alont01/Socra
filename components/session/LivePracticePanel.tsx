'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { PracticeProblem } from '@/lib/ai/types'
import type { StudentAnswerResult } from '@/hooks/useLivePracticeSync'

interface MasteryEntry {
  topic: string
  mastery: number
}

interface LivePracticePanelProps {
  sessionId: string
  problems: PracticeProblem[]
  studentAnswers: Map<string, StudentAnswerResult>
  onProblemsGenerated: (problems: PracticeProblem[]) => void
  onSendToStudent: (problems: PracticeProblem[]) => void
  onClear: () => void
}

export function LivePracticePanel({
  sessionId,
  problems,
  studentAnswers,
  onProblemsGenerated,
  onSendToStudent,
  onClear,
}: LivePracticePanelProps) {
  const [generating, setGenerating] = useState(false)
  const [mode, setMode] = useState<'practice' | 'assessment'>('practice')
  const [sent, setSent] = useState(false)
  const [mastery, setMastery] = useState<MasteryEntry[]>([])

  const generateProblems = async () => {
    setGenerating(true)
    setSent(false)
    try {
      const res = await fetch(`/api/tutoring-sessions/${sessionId}/live-practice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, tutorNotes: '' }),
      })
      if (res.ok) {
        const data = await res.json()
        onProblemsGenerated(data.problems)
        if (data.studentMastery) setMastery(data.studentMastery)
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleSend = () => {
    onSendToStudent(problems)
    setSent(true)
  }

  const handleClear = () => {
    onClear()
    setSent(false)
  }

  const weakTopics = mastery.filter((m) => m.mastery < 0.5)
  const hasNoMastery = mastery.length === 0

  return (
    <div className="h-full flex flex-col">
      {/* Mastery snapshot */}
      {mastery.length > 0 && (
        <div className="mb-3 pb-3 border-b border-stone-100">
          <h4 className="text-xs font-semibold text-stone-500 uppercase mb-2">Student Level</h4>
          <div className="space-y-1.5">
            {mastery.slice(0, 5).map((m) => (
              <div key={m.topic} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-stone-600 truncate">{m.topic}</p>
                </div>
                <div className="w-16 bg-stone-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${m.mastery >= 0.5 ? 'bg-green-400' : 'bg-orange-400'}`}
                    style={{ width: `${Math.round(m.mastery * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-stone-400 w-8 text-right">{Math.round(m.mastery * 100)}%</span>
              </div>
            ))}
          </div>
          {weakTopics.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              Weak areas: {weakTopics.map((m) => m.topic).join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Mode selector + generate */}
      <div className="mb-3">
        <div className="flex bg-stone-100 rounded-lg p-0.5 mb-3">
          {(['practice', 'assessment'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                mode === m
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {m === 'practice' ? 'Practice' : 'Assess Level'}
            </button>
          ))}
        </div>

        {hasNoMastery && mode === 'practice' && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">
            No mastery data yet. Try &quot;Assess Level&quot; first to gauge the student&apos;s current level.
          </p>
        )}

        <Button
          onClick={generateProblems}
          loading={generating}
          size="sm"
          className="w-full"
        >
          {mode === 'assessment' ? 'Generate Assessment' : 'Generate Practice'}
        </Button>
      </div>

      {/* Generated problems */}
      {problems.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-2 mb-3">
          {problems.map((p) => {
            const studentResult = studentAnswers.get(p.id)
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-3 text-xs ${
                  studentResult
                    ? studentResult.correct
                      ? 'border-green-200 bg-green-50'
                      : 'border-red-200 bg-red-50'
                    : 'border-stone-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-medium px-1.5 py-0.5 rounded text-[10px] ${
                    p.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                    p.difficulty === 'hard' ? 'bg-red-100 text-red-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {p.difficulty}
                  </span>
                  <span className="text-stone-400">{p.topic}</span>
                </div>
                <p className="text-stone-700 mb-1">{p.question}</p>
                <p className="text-stone-400 italic">Answer: {p.answer}</p>
                {studentResult && (
                  <div className={`mt-1.5 pt-1.5 border-t ${studentResult.correct ? 'border-green-200' : 'border-red-200'}`}>
                    <p className={studentResult.correct ? 'text-green-700' : 'text-red-700'}>
                      Student: &quot;{studentResult.answer}&quot; {studentResult.correct ? '(correct)' : '(incorrect)'}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Send / Clear */}
      {problems.length > 0 && (
        <div className="flex gap-2">
          {!sent ? (
            <Button onClick={handleSend} size="sm" className="flex-1">
              Send to Student
            </Button>
          ) : (
            <Button onClick={handleClear} variant="ghost" size="sm" className="flex-1">
              Clear Problems
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
