'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingDots } from '@/components/ui/LoadingDots'
import { useToast } from '@/hooks/useToast'

interface Problem {
  id: string
  question: string
  hint: string
  difficulty: 'easy' | 'medium' | 'hard'
  topic: string
  answer?: string
}

interface HomeworkSet {
  id: string
  title: string
  status: 'draft' | 'assigned'
  problems: Problem[]
  attemptCount: number
  assignedAt: string | null
  createdAt: string
}

export function HomeworkManager({ sessionId }: { sessionId: string }) {
  const { toast } = useToast()
  const [sets, setSets] = useState<HomeworkSet[]>([])
  const [fetching, setFetching] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tutor/practice-sets?sessionId=${sessionId}`)
      if (res.ok) {
        const data = await res.json()
        setSets(data.practiceSets || [])
      }
    } finally {
      setFetching(false)
    }
  }, [sessionId])

  useEffect(() => {
    load()
  }, [load])

  const patchLocal = (setId: string, patch: Partial<HomeworkSet>) => {
    setSets((prev) => prev.map((s) => (s.id === setId ? { ...s, ...patch } : s)))
  }

  const patchProblem = (setId: string, idx: number, patch: Partial<Problem>) => {
    setSets((prev) =>
      prev.map((s) =>
        s.id === setId
          ? { ...s, problems: s.problems.map((p, i) => (i === idx ? { ...p, ...patch } : p)) }
          : s,
      ),
    )
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/tutor/practice-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Failed to generate homework', 'error')
        return
      }
      setSets((prev) => [data.practiceSet, ...prev])
      toast('Draft homework generated', 'success')
    } catch {
      toast('Failed to generate homework', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const save = async (set: HomeworkSet, opts: { assign?: boolean } = {}) => {
    setBusyId(set.id)
    try {
      const res = await fetch(`/api/tutor/practice-sets/${set.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: set.title,
          problems: set.problems,
          ...(opts.assign ? { status: 'assigned' } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Failed to save', 'error')
        return
      }
      patchLocal(set.id, data.practiceSet)
      toast(opts.assign ? 'Assigned as homework' : 'Draft saved', 'success')
    } catch {
      toast('Failed to save', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const setStatus = async (set: HomeworkSet, status: 'draft' | 'assigned') => {
    setBusyId(set.id)
    try {
      const res = await fetch(`/api/tutor/practice-sets/${set.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Failed to update', 'error')
        return
      }
      patchLocal(set.id, data.practiceSet)
      toast(status === 'assigned' ? 'Assigned as homework' : 'Reverted to draft', 'success')
    } catch {
      toast('Failed to update', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const discard = async (set: HomeworkSet) => {
    setBusyId(set.id)
    try {
      const res = await fetch(`/api/tutor/practice-sets/${set.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast(data.error || 'Failed to discard', 'error')
        return
      }
      setSets((prev) => prev.filter((s) => s.id !== set.id))
      toast('Draft discarded', 'success')
    } catch {
      toast('Failed to discard', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-stone-900">Homework</h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Review the AI-generated set, edit anything, then assign it to the student.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={generate} loading={generating}>
          Generate set
        </Button>
      </div>

      {fetching ? (
        <div className="flex justify-center py-8">
          <LoadingDots />
        </div>
      ) : sets.length === 0 ? (
        <p className="text-sm text-stone-500 py-4">
          No homework yet. Generate a set from this lesson&apos;s analysis to get started.
        </p>
      ) : (
        <div className="space-y-4">
          {sets.map((set) => {
            const isDraft = set.status === 'draft'
            const busy = busyId === set.id
            return (
              <div key={set.id} className="border border-stone-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  {isDraft ? (
                    <input
                      value={set.title}
                      onChange={(e) => patchLocal(set.id, { title: e.target.value })}
                      className="flex-1 text-sm font-semibold text-stone-900 px-2 py-1 rounded-lg border border-stone-200 focus:outline-none focus:border-orange-400"
                    />
                  ) : (
                    <h4 className="flex-1 text-sm font-semibold text-stone-900">{set.title}</h4>
                  )}
                  <Badge variant={isDraft ? 'amber' : 'green'}>{isDraft ? 'Draft' : 'Assigned'}</Badge>
                </div>

                {isDraft ? (
                  <div className="space-y-3">
                    {set.problems.map((p, idx) => (
                      <div key={p.id} className="rounded-lg bg-stone-50 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-stone-400">Problem {idx + 1}</span>
                          <select
                            value={p.difficulty}
                            onChange={(e) =>
                              patchProblem(set.id, idx, { difficulty: e.target.value as Problem['difficulty'] })
                            }
                            className="text-xs rounded-md border border-stone-200 px-1.5 py-0.5 bg-white"
                          >
                            <option value="easy">easy</option>
                            <option value="medium">medium</option>
                            <option value="hard">hard</option>
                          </select>
                        </div>
                        <textarea
                          value={p.question}
                          onChange={(e) => patchProblem(set.id, idx, { question: e.target.value })}
                          rows={2}
                          placeholder="Question"
                          className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 focus:outline-none focus:border-orange-400 resize-y"
                        />
                        <input
                          value={p.answer ?? ''}
                          onChange={(e) => patchProblem(set.id, idx, { answer: e.target.value })}
                          placeholder="Correct answer"
                          className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 focus:outline-none focus:border-orange-400"
                        />
                        <input
                          value={p.hint}
                          onChange={(e) => patchProblem(set.id, idx, { hint: e.target.value })}
                          placeholder="Hint (optional)"
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-stone-200 focus:outline-none focus:border-orange-400"
                        />
                      </div>
                    ))}

                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" onClick={() => save(set, { assign: true })} loading={busy}>
                        Assign to student
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => save(set)} disabled={busy}>
                        Save draft
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => discard(set)} disabled={busy} className="text-red-500 ml-auto">
                        Discard
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-stone-500">
                      {set.problems.length} problems · {set.attemptCount} attempt{set.attemptCount === 1 ? '' : 's'} by student
                      {set.assignedAt ? ` · assigned ${new Date(set.assignedAt).toLocaleDateString()}` : ''}
                    </p>
                    {set.attemptCount === 0 && (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(set, 'draft')} disabled={busy}>
                        Revert to draft
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
