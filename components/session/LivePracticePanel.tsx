'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { RichContent } from '@/components/visuals/RichContent'
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
  onOverride: (problemId: string, problemTopic: string) => void
}

export function LivePracticePanel({
  sessionId,
  problems,
  studentAnswers,
  onProblemsGenerated,
  onSendToStudent,
  onClear,
  onOverride,
}: LivePracticePanelProps) {
  const [generating, setGenerating] = useState(false)
  const [sent, setSent] = useState(false)
  const [mastery, setMastery] = useState<MasteryEntry[]>([])
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)

  const generateProblems = async () => {
    setGenerating(true)
    setSent(false)
    setEditedAnswers({})
    try {
      const res = await fetch(`/api/tutoring-sessions/${sessionId}/live-practice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'practice', tutorNotes: '' }),
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

  const handleSend = async () => {
    const hasEdits = Object.keys(editedAnswers).length > 0
    setSending(true)

    try {
      let finalProblems = problems

      if (hasEdits) {
        // Re-sign edited answers with fresh tokens
        const problemsToSign = problems
          .filter((p) => editedAnswers[p.id] !== undefined)
          .map((p) => ({
            id: p.id,
            answer: editedAnswers[p.id],
            topic: p.topic,
          }))

        const res = await fetch(`/api/tutoring-sessions/${sessionId}/live-practice/sign-answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problems: problemsToSign }),
        })

        if (res.ok) {
          const { tokens } = await res.json()
          finalProblems = problems.map((p) => {
            if (editedAnswers[p.id] !== undefined) {
              return { ...p, answer: editedAnswers[p.id], answerToken: tokens[p.id] }
            }
            return p
          })
          // Update parent state with corrected problems
          onProblemsGenerated(finalProblems)
        }
      }

      onSendToStudent(finalProblems)
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  const handleClear = () => {
    onClear()
    setSent(false)
    setEditedAnswers({})
  }

  const getAnswer = (p: PracticeProblem) =>
    editedAnswers[p.id] !== undefined ? editedAnswers[p.id] : (p.answer || '')

  const isEdited = (p: PracticeProblem) => editedAnswers[p.id] !== undefined

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

      {/* Generate */}
      <div className="mb-3">
        {hasNoMastery && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">
            No mastery data yet. Try the <span className="font-medium">Assessment</span> tab first to gauge the student&apos;s current level.
          </p>
        )}

        <Button
          onClick={generateProblems}
          loading={generating}
          size="sm"
          className="w-full"
        >
          Generate Practice
        </Button>
      </div>

      {/* Generated problems */}
      {problems.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-2 mb-3">
          {problems.map((p) => {
            const studentResult = studentAnswers.get(p.id)
            const edited = isEdited(p)
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
                <div className="text-stone-700 mb-1">
                  <RichContent content={p.question} />
                </div>

                {/* Editable answer field */}
                {!sent ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-stone-400 italic shrink-0">Answer:</span>
                    <input
                      type="text"
                      value={getAnswer(p)}
                      onChange={(e) => setEditedAnswers((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className={`flex-1 text-xs px-2 py-1 border rounded ${
                        edited
                          ? 'border-orange-300 bg-orange-50 text-orange-800'
                          : 'border-stone-200 text-stone-500 italic'
                      }`}
                    />
                    {edited && (
                      <button
                        onClick={() => setEditedAnswers((prev) => {
                          const next = { ...prev }
                          delete next[p.id]
                          return next
                        })}
                        className="text-stone-400 hover:text-stone-600 text-[10px]"
                        title="Reset to AI answer"
                      >
                        undo
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-stone-400 italic">
                    Answer: {getAnswer(p)}
                    {edited && <span className="text-orange-500 not-italic ml-1">(corrected)</span>}
                  </p>
                )}

                {studentResult && (
                  <div className={`mt-1.5 pt-1.5 border-t ${studentResult.correct ? 'border-green-200' : 'border-red-200'}`}>
                    <div className="flex items-center justify-between">
                      <p className={studentResult.correct ? 'text-green-700' : 'text-red-700'}>
                        Student: &quot;{studentResult.answer}&quot; {studentResult.correct ? '(correct)' : '(incorrect)'}
                      </p>
                      {!studentResult.correct && (
                        <button
                          onClick={() => onOverride(p.id, p.topic)}
                          className="text-[10px] text-orange-500 hover:text-orange-700 font-medium shrink-0 ml-2"
                        >
                          Mark Correct
                        </button>
                      )}
                    </div>
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
            <Button onClick={handleSend} loading={sending} size="sm" className="flex-1">
              {Object.keys(editedAnswers).length > 0 ? 'Send Corrected' : 'Send to Student'}
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
