'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { DailyCall, DailyEventObjectAppMessage } from '@daily-co/daily-js'

type WhiteboardMessageType =
  | 'whiteboard:start'
  | 'whiteboard:stop'
  | 'whiteboard:state'
  | 'whiteboard:request-state'

interface WhiteboardMessage {
  type: WhiteboardMessageType
  payload?: string
}

interface UseWhiteboardSyncOptions {
  callFrame: DailyCall | null
  isTutor: boolean
  onRemoteStateReceived?: (json: string) => void
  onWhiteboardStarted?: () => void
  onWhiteboardStopped?: () => void
}

export function useWhiteboardSync({
  callFrame,
  isTutor,
  onRemoteStateReceived,
  onWhiteboardStarted,
  onWhiteboardStopped,
}: UseWhiteboardSyncOptions) {
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const latestCanvasJsonRef = useRef<string | null>(null)

  const sendCanvasState = useCallback(
    (json: string) => {
      if (!callFrame || !isTutor) return
      latestCanvasJsonRef.current = json

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const msg: WhiteboardMessage = { type: 'whiteboard:state', payload: json }
        callFrame.sendAppMessage(msg, '*')
      }, 150)
    },
    [callFrame, isTutor]
  )

  const sendWhiteboardStart = useCallback(() => {
    if (!callFrame || !isTutor) return
    const msg: WhiteboardMessage = { type: 'whiteboard:start' }
    callFrame.sendAppMessage(msg, '*')
  }, [callFrame, isTutor])

  const sendWhiteboardStop = useCallback(() => {
    if (!callFrame || !isTutor) return
    const msg: WhiteboardMessage = { type: 'whiteboard:stop' }
    callFrame.sendAppMessage(msg, '*')
  }, [callFrame, isTutor])

  useEffect(() => {
    if (!callFrame) return

    const handleAppMessage = (event: DailyEventObjectAppMessage | undefined) => {
      if (!event) return
      const msg = event.data as WhiteboardMessage
      if (!msg || !msg.type) return

      switch (msg.type) {
        case 'whiteboard:state':
          if (!isTutor && msg.payload) {
            // Receiving state implies the whiteboard is active — make sure it's
            // visible. This covers a late-joining/refreshing student who missed
            // the original 'whiteboard:start' broadcast.
            onWhiteboardStarted?.()
            onRemoteStateReceived?.(msg.payload)
          }
          break
        case 'whiteboard:start':
          if (!isTutor) {
            onWhiteboardStarted?.()
          }
          break
        case 'whiteboard:stop':
          if (!isTutor) {
            onWhiteboardStopped?.()
          }
          break
        case 'whiteboard:request-state':
          if (isTutor && latestCanvasJsonRef.current) {
            const reply: WhiteboardMessage = {
              type: 'whiteboard:state',
              payload: latestCanvasJsonRef.current,
            }
            callFrame.sendAppMessage(reply, '*')
          }
          break
      }
    }

    callFrame.on('app-message', handleAppMessage)

    // Student: request current state on mount (late join)
    if (!isTutor) {
      const requestMsg: WhiteboardMessage = { type: 'whiteboard:request-state' }
      callFrame.sendAppMessage(requestMsg, '*')
    }

    return () => {
      callFrame.off('app-message', handleAppMessage)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [callFrame, isTutor, onRemoteStateReceived, onWhiteboardStarted, onWhiteboardStopped])

  return { sendCanvasState, sendWhiteboardStart, sendWhiteboardStop }
}
