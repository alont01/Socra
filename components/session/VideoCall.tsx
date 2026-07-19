'use client'

import { useEffect, useRef, useCallback } from 'react'
import DailyIframe, { DailyCall, DailyEventObjectParticipantLeft } from '@daily-co/daily-js'

interface VideoCallProps {
  roomUrl: string
  token: string
  onLeave?: () => void
  onCallFrame?: (frame: DailyCall | null) => void
}

export function VideoCall({ roomUrl, token, onLeave, onCallFrame }: VideoCallProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callRef = useRef<DailyCall | null>(null)

  // Keep the latest onCallFrame in a ref so the call-frame effect doesn't have
  // to depend on it — re-running the effect would tear down and rebuild the
  // live Daily call every time the parent re-passes the callback.
  const onCallFrameRef = useRef(onCallFrame)
  useEffect(() => { onCallFrameRef.current = onCallFrame }, [onCallFrame])

  const handleLeave = useCallback(() => {
    onLeave?.()
  }, [onLeave])

  useEffect(() => {
    if (!containerRef.current || !roomUrl || !token) return

    const frame = DailyIframe.createFrame(containerRef.current, {
      iframeStyle: {
        width: '100%',
        height: '100%',
        border: '0',
        borderRadius: '16px',
      },
      showLeaveButton: true,
      showFullscreenButton: true,
    })

    callRef.current = frame
    let destroyed = false

    frame.join({ url: roomUrl, token }).then(() => {
      if (!destroyed) onCallFrameRef.current?.(frame)
    })

    const handleParticipantLeft = (event: DailyEventObjectParticipantLeft) => {
      if (!event.participant.local) {
        handleLeave()
      }
    }

    frame.on('left-meeting', handleLeave)
    frame.on('participant-left', handleParticipantLeft)

    return () => {
      destroyed = true
      frame.off('left-meeting', handleLeave)
      frame.off('participant-left', handleParticipantLeft)
      onCallFrameRef.current?.(null)
      frame.destroy()
      callRef.current = null
    }
  }, [roomUrl, token, handleLeave])

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px] rounded-2xl overflow-hidden bg-stone-900" />
  )
}
