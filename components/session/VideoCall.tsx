'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import DailyIframe, {
  DailyCall,
  DailyEventObjectParticipantLeft,
  DailyEventObjectAppMessage,
} from '@daily-co/daily-js'
import { reportClientError } from '@/lib/report-client-error'

interface VideoCallProps {
  roomUrl: string
  token: string
  onLeave?: () => void
  onCallFrame?: (frame: DailyCall | null) => void
  isTutor?: boolean
}

// If the other participant drops and doesn't come back within this window, we
// treat it as a real departure and leave. Short blips no longer eject anyone.
const RECONNECT_GRACE_MS = 60_000

export function VideoCall({ roomUrl, token, onLeave, onCallFrame, isTutor = false }: VideoCallProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callRef = useRef<DailyCall | null>(null)
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [remoteGone, setRemoteGone] = useState(false)
  const [joinFailed, setJoinFailed] = useState(false)

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

    // A rejected join (expired token, deleted room, blocked camera, offline)
    // otherwise surfaces as an unhandled rejection and a silent black box —
    // the participant is left staring at nothing with no way to know why.
    frame.join({ url: roomUrl, token }).then(
      () => { if (!destroyed) onCallFrameRef.current?.(frame) },
      (err: unknown) => {
        if (destroyed) return
        reportClientError(err, { source: 'VideoCall.join' })
        setJoinFailed(true)
      },
    )

    const clearGrace = () => {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current)
        graceTimerRef.current = null
      }
    }

    // A remote participant leaving may be a transient network drop, not an
    // intentional exit. Show a "reconnecting" overlay and only actually leave
    // if they don't return within the grace window.
    //
    // The auto-leave only applies to the student. Ending a session is a real,
    // consequential action the tutor takes explicitly (it stops billing and
    // fires the analysis pipeline) — they must not be silently ejected just
    // because the student's connection dropped or, in the ordinary end-of-
    // lesson case, the student leaves first. Forcing `onLeave` for the tutor
    // used to unmount the whole in-call tree (including the whiteboard, which
    // disposes its canvas on unmount) out from under a tutor who was still
    // writing notes — losing the board before they ever got to click End.
    // The "waiting to reconnect" banner below still shows for the tutor, and
    // they can End Session themselves whenever they're ready.
    const handleParticipantLeft = (event: DailyEventObjectParticipantLeft | undefined) => {
      if (event?.participant?.local) return
      setRemoteGone(true)
      clearGrace()
      if (isTutor) return
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
  }, [roomUrl, token, handleLeave, isTutor])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full min-h-[400px] rounded-2xl overflow-hidden bg-stone-900" />
      {joinFailed && (
        <div className="absolute inset-0 grid place-items-center rounded-2xl bg-stone-900/95 p-6 text-center">
          <div className="max-w-sm">
            <p className="text-white font-semibold mb-1">Couldn&rsquo;t connect to the video room</p>
            <p className="text-stone-300 text-sm mb-4">
              This can happen if the session link expired or your camera is blocked by the browser.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-stone-100 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )}
      {remoteGone && !joinFailed && (
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
