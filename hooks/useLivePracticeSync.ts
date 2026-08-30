'use client'

import { useEffect, useCallback, useRef } from 'react'
import type { DailyCall, DailyEventObjectAppMessage } from '@daily-co/daily-js'
import type { PracticeProblem } from '@/lib/ai/types'

type PracticeMessageType =
  | 'practice:problems'
  | 'practice:answer'
  | 'practice:clear'
  | 'practice:override'
  | 'practice:request-state'

interface PracticeMessage {
  type: PracticeMessageType
  payload?: string
}

export interface StudentAnswerResult {
  problemId: string
  answer: string
  correct: boolean
}

interface UseLivePracticeSyncOptions {
  callFrame: DailyCall | null
  isTutor: boolean
  onProblemsReceived?: (problems: PracticeProblem[]) => void
  onAnswerReceived?: (result: StudentAnswerResult) => void
  onCleared?: () => void
  onOverrideReceived?: (problemId: string) => void
}

export function useLivePracticeSync({
  callFrame,
  isTutor,
  onProblemsReceived,
  onAnswerReceived,
  onCleared,
  onOverrideReceived,
}: UseLivePracticeSyncOptions) {
  // The problems currently in front of the student, as last broadcast. Sent
  // problems live only in the tutor's browser memory, so a student who
  // refreshes or joins late used to end up with an empty panel and no way back
  // — the tutor's only recourse was Clear and regenerate, which throws away
  // the work. Keeping the last payload lets us answer a re-join request, the
  // same way the whiteboard answers 'whiteboard:request-state'.
  const lastSentRef = useRef<string | null>(null)

  const sendProblems = useCallback(
    // Returns whether the broadcast actually went out (a live callFrame to
    // send it through) — the caller flips its UI to "Sent to student" off
    // this, so a false here must not be swallowed. Without it, a tutor whose
    // Daily join hadn't resolved yet (or had failed) saw "Sent" while the
    // student's panel received nothing.
    (problems: PracticeProblem[]): boolean => {
      if (!callFrame || !isTutor) return false
      // Strip answers before sending to student
      const safe = problems.map(({ answer, ...rest }) => rest)
      const payload = JSON.stringify(safe)
      lastSentRef.current = payload
      const msg: PracticeMessage = { type: 'practice:problems', payload }
      callFrame.sendAppMessage(msg, '*')
      return true
    },
    [callFrame, isTutor]
  )

  const sendAnswer = useCallback(
    (result: StudentAnswerResult) => {
      if (!callFrame || isTutor) return
      const msg: PracticeMessage = {
        type: 'practice:answer',
        payload: JSON.stringify(result),
      }
      callFrame.sendAppMessage(msg, '*')
    },
    [callFrame, isTutor]
  )

  const sendClear = useCallback(() => {
    if (!callFrame || !isTutor) return
    lastSentRef.current = null
    const msg: PracticeMessage = { type: 'practice:clear' }
    callFrame.sendAppMessage(msg, '*')
  }, [callFrame, isTutor])

  const sendOverride = useCallback(
    (problemId: string) => {
      if (!callFrame || !isTutor) return
      const msg: PracticeMessage = {
        type: 'practice:override',
        payload: problemId,
      }
      callFrame.sendAppMessage(msg, '*')
    },
    [callFrame, isTutor]
  )

  useEffect(() => {
    if (!callFrame) return

    const handleAppMessage = (event: DailyEventObjectAppMessage | undefined) => {
      if (!event) return
      const msg = event.data as PracticeMessage
      if (!msg || !msg.type || !msg.type.startsWith('practice:')) return

      switch (msg.type) {
        case 'practice:problems':
          if (!isTutor && msg.payload) {
            try {
              const problems = JSON.parse(msg.payload) as PracticeProblem[]
              onProblemsReceived?.(problems)
            } catch { /* skip malformed */ }
          }
          break
        case 'practice:answer':
          if (isTutor && msg.payload) {
            try {
              const result = JSON.parse(msg.payload) as StudentAnswerResult
              onAnswerReceived?.(result)
            } catch { /* skip malformed */ }
          }
          break
        case 'practice:clear':
          if (!isTutor) {
            onCleared?.()
          }
          break
        case 'practice:override':
          if (!isTutor && msg.payload) {
            onOverrideReceived?.(msg.payload)
          }
          break
        case 'practice:request-state':
          // A (re)joining student asks what they should be working on. Replay
          // the last broadcast; nothing outstanding means nothing to send.
          if (isTutor && lastSentRef.current) {
            callFrame.sendAppMessage(
              { type: 'practice:problems', payload: lastSentRef.current } satisfies PracticeMessage,
              '*',
            )
          }
          break
      }
    }

    callFrame.on('app-message', handleAppMessage)

    // Student: ask for anything already in flight (covers a refresh or a late
    // join). Harmless when there's nothing outstanding.
    if (!isTutor) {
      callFrame.sendAppMessage({ type: 'practice:request-state' } satisfies PracticeMessage, '*')
    }

    return () => {
      callFrame.off('app-message', handleAppMessage)
    }
  }, [callFrame, isTutor, onProblemsReceived, onAnswerReceived, onCleared, onOverrideReceived])

  return { sendProblems, sendAnswer, sendClear, sendOverride }
}
