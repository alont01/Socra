'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InviteParentButton } from '@/components/parent/InviteParentButton'

interface Student {
  id: string
  name: string
  email: string
  gradeLevel: string
  mathTopics: string
}

interface StudentRosterProps {
  students: Student[]
  onStudentAdded: (student: Student) => void
  onStudentRemoved: (id: string) => void
}

export function StudentRoster({ students, onStudentAdded, onStudentRemoved }: StudentRosterProps) {
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  const addStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setAdding(true)
    try {
      const res = await fetch('/api/tutor/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error)
        return
      }
      onStudentAdded(data.student)
      setEmail('')
    } catch {
      setError('Network error')
    } finally {
      setAdding(false)
    }
  }

  const removeStudent = async (id: string) => {
    setRemoving(id)
    try {
      const res = await fetch(`/api/tutor/students/${id}`, { method: 'DELETE' })
      if (res.ok) onStudentRemoved(id)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5">
      <h3 className="font-semibold text-stone-900 mb-1">My Students</h3>
      <p className="text-xs text-stone-400 mb-4">
        New students usually arrive when a parent signs up — they&apos;re matched to you automatically. You can also add a student who already has their own Socra account below.
      </p>

      <form onSubmit={addStudent} className="flex gap-2 mb-4">
        <Input
          placeholder="Student email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" size="sm" loading={adding} className="shrink-0">
          Add
        </Button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {students.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-4">
          No students yet. They&apos;ll appear here once a parent signs up and is matched with you.
        </p>
      ) : (
        <div className="space-y-2">
          {students.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-stone-50">
              <div>
                <p className="font-medium text-stone-900 text-sm">{s.name}</p>
                <p className="text-xs text-stone-400">{s.email} · {s.gradeLevel || 'Grade not set'}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <InviteParentButton studentId={s.id} label="Invite parent" />
                <button
                  onClick={() => removeStudent(s.id)}
                  disabled={removing === s.id}
                  className="text-xs text-stone-400 hover:text-red-500 transition-colors"
                >
                  {removing === s.id ? '...' : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
