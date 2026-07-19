'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import DailyIframe, {
  DailyCall,
  DailyEventObjectParticipantLeft,
  DailyEventObjectAppMessage,
} from '@daily-co/daily-js'

interface VideoCallProps {
  roomUrl: string
  token: string
  onLeave?: () => void
  onCallFrame?: (frame: DailyCall | null) => void
}

// If the other participant drops and doesn't come back within this window, we
// treat it as a real departure and leave. Short blips no longer eject anyone.
const RECONNECT_GRACE_MS = 60_000

export function VideoCall({ roomUrl, token, onLeave, onCallFrame }: VideoCallProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callRef = useRef<DailyCall | null>(null)
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [remoteGone, setRemoteGone] = useState(false)

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

    const clearGrace = () => {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current)
        graceTimerRef.current = null
      }
    }

    // A remote participant leaving may be a transient network drop, not an
    // intentional exit. Show a "reconnecting" overlay and only actually leave
    // if they don't return within the grace window.
    const handleParticipantLeft = (event: DailyEventObjectParticipantLeft | undefined) => {
      if (event?.participant?.local) return
      setRemoteGone(true)
      clearGrace()
      graceTimerRef.current = setTimeout(() => {
        if (!destroyed) handleLeave()
      }, RECONNECT_GRACE_MS)
    }

    const handleParticipantJoined = () => {
      setRemoteGone(false)
      clearGrace()
    }

    // The tutor broadcasts this when they intentionally end the session, so the
    // student leaves immediately instead of waiting out the reconnect grace.
    const handleAppMessage = (event: DailyEventObjectAppMessage | undefined) => {
      if (event?.data?.type === 'session:ended') handleLeave()
    }

    frame.on('left-meeting', handleLeave)
    frame.on('participant-left', handleParticipantLeft)
    frame.on('participant-joined', handleParticipantJoined)
    frame.on('app-message', handleAppMessage)

    return () => {
      destroyed = true
      clearGrace()
      frame.off('left-meeting', handleLeave)
      frame.off('participant-left', handleParticipantLeft)
      frame.off('participant-joined', handleParticipantJoined)
      frame.off('app-message', handleAppMessage)
      onCallFrameRef.current?.(null)
      frame.destroy()
      callRef.current = null
    }
  }, [roomUrl, token, handleLeave])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full min-h-[400px] rounded-2xl overflow-hidden bg-stone-900" />
      {remoteGone && (
        <div className="absolute inset-x-0 top-0 flex justify-center p-3 pointer-events-none">
          <div className="flex items-center gap-2 rounded-full bg-stone-900/85 text-white text-sm px-4 py-2 shadow-lg backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            Waiting for the other participant to reconnect…
          </div>
        </div>
      )}
    </div>
  )
}
