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
      if (!destroyed) onCallFrame?.(frame)
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
      onCallFrame?.(null)
      frame.destroy()
      callRef.current = null
    }
  }, [roomUrl, token, handleLeave])

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px] rounded-2xl overflow-hidden bg-stone-900" />
  )
}
