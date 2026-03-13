'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface CallHeaderProps {
  topic: string
  startedAt: string | null
  onEndCall: () => void
  ending: boolean
  isTutor: boolean
  whiteboardActive?: boolean
  onToggleWhiteboard?: () => void
}

export function CallHeader({ topic, startedAt, onEndCall, ending, isTutor, whiteboardActive, onToggleWhiteboard }: CallHeaderProps) {
  const [elapsed, setElapsed] = useState('00:00')

  useEffect(() => {
    if (!startedAt) return

    const start = new Date(startedAt).getTime()
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - start) / 1000)
      const mins = Math.floor(diff / 60).toString().padStart(2, '0')
      const secs = (diff % 60).toString().padStart(2, '0')
      setElapsed(`${mins}:${secs}`)
    }, 1000)

    return () => clearInterval(interval)
  }, [startedAt])

  return (
    <div className="flex items-center justify-between bg-white rounded-2xl border border-orange-100 shadow-sm px-5 py-3">
      <div>
        <h2 className="font-semibold text-stone-900">{topic || 'Session'}</h2>
        <p className="text-xs text-stone-400">{elapsed}</p>
      </div>
      <div className="flex items-center gap-2">
        {isTutor && onToggleWhiteboard && (
          <Button
            variant={whiteboardActive ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onToggleWhiteboard}
          >
            Whiteboard
          </Button>
        )}
        {isTutor && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEndCall}
            loading={ending}
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            End Session
          </Button>
        )}
      </div>
    </div>
  )
}
