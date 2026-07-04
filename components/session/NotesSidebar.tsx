'use client'

import { useState, useCallback } from 'react'

interface NotesSidebarProps {
  sessionId: string
  initialNotes: string
}

export function NotesSidebar({ sessionId, initialNotes }: NotesSidebarProps) {
  const [notes, setNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  const saveNotes = useCallback(async (value: string) => {
    setSaving(true)
    try {
      await fetch(`/api/tutoring-sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorNotes: value }),
      })
      setLastSaved(new Date())
    } finally {
      setSaving(false)
    }
  }, [sessionId])

  // Auto-save on blur
  const handleBlur = () => {
    saveNotes(notes)
  }

  return (
    <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-stone-900 text-sm">Session Notes</h3>
        <span className="text-xs text-stone-400">
          {saving ? 'Saving...' : lastSaved ? 'Saved' : ''}
        </span>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleBlur}
        placeholder="Type your session notes here..."
        className="flex-1 w-full resize-none text-sm text-stone-700 placeholder:text-stone-300 focus:outline-none"
      />
    </div>
  )
}
