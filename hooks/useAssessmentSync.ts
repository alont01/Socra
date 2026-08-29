'use client'

import { useEffect, useCallback } from 'react'
import type { DailyCall, DailyEventObjectAppMessage } from '@daily-co/daily-js'

// Assessment state (level ladder, AI-generated items, holistic result) is
// richer than the whiteboard/live-practice payloads, so rather than broadcast
// full state over Daily's data channel, this just signals "something
// changed" — the receiver re-fetches the authoritative state from
// GET /api/tutoring-sessions/[id]/assessment. Simpler and can't drift out of
// sync with the server.
//
// 'assessment:generating' is the leading edge of the same story: the next item
// is generated inside the student's answer request, so between the student
// hitting Submit and the new problem existing there is a silent window with
// nothing to re-fetch. Without this signal the tutor's panel goes on saying
// "waiting for the student to answer" while the model is already working.
interface AssessmentSignal {
  type: 'assessment:changed' | 'assessment:generating'
}

export function useAssessmentSync({
  callFrame,
  onChanged,
  onGenerating,
}: {
  callFrame: DailyCall | null
  onChanged: () => void
  onGenerating?: () => void
}) {
  const send = useCallback(
    (type: AssessmentSignal['type']) => {
      if (!callFrame) return
      callFrame.sendAppMessage({ type } satisfies AssessmentSignal, '*')
    },
    [callFrame],
  )

  const notifyChanged = useCallback(() => send('assessment:changed'), [send])
  const notifyGenerating = useCallback(() => send('assessment:generating'), [send])

  useEffect(() => {
    if (!callFrame) return
    const handleAppMessage = (event: DailyEventObjectAppMessage | undefined) => {
      const msg = event?.data as AssessmentSignal | undefined
      if (msg?.type === 'assessment:changed') onChanged()
      else if (msg?.type === 'assessment:generating') onGenerating?.()
    }
    callFrame.on('app-message', handleAppMessage)
    return () => {
      callFrame.off('app-message', handleAppMessage)
    }
  }, [callFrame, onChanged, onGenerating])

  return { notifyChanged, notifyGenerating }
}
