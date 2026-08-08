'use client'

import { useEffect, useCallback } from 'react'
import type { DailyCall, DailyEventObjectAppMessage } from '@daily-co/daily-js'

// Assessment state (level ladder, AI-generated items, holistic result) is
// richer than the whiteboard/live-practice payloads, so rather than broadcast
// full state over Daily's data channel, this just signals "something
// changed" — the receiver re-fetches the authoritative state from
// GET /api/tutoring-sessions/[id]/assessment. Simpler and can't drift out of
// sync with the server.
interface AssessmentSignal {
  type: 'assessment:changed'
}

export function useAssessmentSync({
  callFrame,
  onChanged,
}: {
  callFrame: DailyCall | null
  onChanged: () => void
}) {
  const notifyChanged = useCallback(() => {
    if (!callFrame) return
    const msg: AssessmentSignal = { type: 'assessment:changed' }
    callFrame.sendAppMessage(msg, '*')
  }, [callFrame])

  useEffect(() => {
    if (!callFrame) return
    const handleAppMessage = (event: DailyEventObjectAppMessage | undefined) => {
      const msg = event?.data as AssessmentSignal | undefined
      if (msg?.type === 'assessment:changed') onChanged()
    }
    callFrame.on('app-message', handleAppMessage)
    return () => {
      callFrame.off('app-message', handleAppMessage)
    }
  }, [callFrame, onChanged])

  return { notifyChanged }
}
