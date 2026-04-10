'use client'

import { useEffect, useCallback } from 'react'
import type { DailyCall, DailyEventObjectAppMessage } from '@daily-co/daily-js'
import type { PracticeProblem } from '@/lib/ai/types'

type PracticeMessageType =
  | 'practice:problems'
  | 'practice:answer'
  | 'practice:clear'

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
}

export function useLivePracticeSync({
  callFrame,
  isTutor,
  onProblemsReceived,
  onAnswerReceived,
  onCleared,
}: UseLivePracticeSyncOptions) {
  const sendProblems = useCallback(
    (problems: PracticeProblem[]) => {
      if (!callFrame || !isTutor) return
      // Strip answers before sending to student
      const safe = problems.map(({ answer, ...rest }) => rest)
      const msg: PracticeMessage = {
        type: 'practice:problems',
        payload: JSON.stringify(safe),
      }
      callFrame.sendAppMessage(msg, '*')
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
    const msg: PracticeMessage = { type: 'practice:clear' }
    callFrame.sendAppMessage(msg, '*')
  }, [callFrame, isTutor])

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
      }
    }

    callFrame.on('app-message', handleAppMessage)
    return () => {
      callFrame.off('app-message', handleAppMessage)
    }
  }, [callFrame, isTutor, onProblemsReceived, onAnswerReceived, onCleared])

  return { sendProblems, sendAnswer, sendClear }
}
