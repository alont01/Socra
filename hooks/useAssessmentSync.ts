'use client'

import { useEffect, useCallback, useRef } from 'react'
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
//
// 'assessment:request-state' mirrors the same signal in useWhiteboardSync and
// useLivePracticeSync: a student's callFrame isn't guaranteed to be ready the
// instant they land on the session page, so a tutor who starts (or overrides,
// or ends) an assessment in that window has their `notifyChanged()` broadcast
// go nowhere, with no error on either side — the tutor's own view already
// updated from the API response, so nothing looked wrong. The student sends
// this on mount/reconnect; the tutor replies with a fresh 'assessment:changed'
// so a missed broadcast is caught up rather than lost until the next change.
interface AssessmentSignal {
  type: 'assessment:changed' | 'assessment:generating' | 'assessment:request-state'
}

export function useAssessmentSync({
  callFrame,
  isTutor,
  onChanged,
  onGenerating,
}: {
  callFrame: DailyCall | null
  isTutor: boolean
  onChanged: () => void
  onGenerating?: () => void
}) {
  // Signals emitted before `callFrame` is ready — a student who hits Submit in
  // the first seconds after joining, while Daily's iframe is still connecting.
  // `send` used to silently no-op there, so the tutor's panel stayed on
  // "waiting for the student to answer…" forever: it re-fetches only on mount
  // and on an incoming 'assessment:changed', and the student never asks for
  // state (only the tutor replies to 'request-state'). Queue and flush when the
  // frame connects instead, so nothing is dropped.
  const pendingRef = useRef<AssessmentSignal['type'][]>([])

  const send = useCallback(
    (type: AssessmentSignal['type']): boolean => {
      if (!callFrame) {
        pendingRef.current.push(type)
        return false
      }
      callFrame.sendAppMessage({ type } satisfies AssessmentSignal, '*')
      return true
    },
    [callFrame],
  )

  const notifyChanged = useCallback(() => send('assessment:changed'), [send])
  const notifyGenerating = useCallback(() => send('assessment:generating'), [send])

  useEffect(() => {
    if (!callFrame) return

    // Flush anything queued while the frame was still connecting, in order.
    if (pendingRef.current.length > 0) {
      const queued = pendingRef.current
      pendingRef.current = []
      for (const type of queued) {
        callFrame.sendAppMessage({ type } satisfies AssessmentSignal, '*')
      }
    }

    const handleAppMessage = (event: DailyEventObjectAppMessage | undefined) => {
      const msg = event?.data as AssessmentSignal | undefined
      if (msg?.type === 'assessment:changed') onChanged()
      else if (msg?.type === 'assessment:generating') onGenerating?.()
      else if (msg?.type === 'assessment:request-state' && isTutor) send('assessment:changed')
    }
    callFrame.on('app-message', handleAppMessage)

    // Student: ask for the current state on (re)join — covers a start,
    // override, or end that broadcast before this client was ready to hear it.
    if (!isTutor) send('assessment:request-state')

    return () => {
      callFrame.off('app-message', handleAppMessage)
    }
  }, [callFrame, isTutor, onChanged, onGenerating, send])

  return { notifyChanged, notifyGenerating }
}
