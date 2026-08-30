'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { VideoCall } from '@/components/session/VideoCall'
import { CallHeader } from '@/components/session/CallHeader'
import { SessionSidebar } from '@/components/session/SessionSidebar'
import { StudentProblemPanel } from '@/components/session/StudentProblemPanel'
import { AssessmentStudentPanel } from '@/components/session/AssessmentStudentPanel'
import { JoinCallCard } from '@/components/session/JoinCallCard'
import { CaptureNotesButton } from '@/components/session/CaptureNotesButton'
import { Whiteboard, type DrawFn } from '@/components/session/Whiteboard'
import { VisualizePanel } from '@/components/session/VisualizePanel'
import { useWhiteboardSync } from '@/hooks/useWhiteboardSync'
import { useLivePracticeSync } from '@/hooks/useLivePracticeSync'
import type { StudentAnswerResult } from '@/hooks/useLivePracticeSync'
import { Skeleton } from '@/components/ui/Skeleton'
import { Navbar } from '@/components/Navbar'
import { useToast } from '@/hooks/useToast'
import type { DailyCall } from '@daily-co/daily-js'
import type { PracticeProblem } from '@/lib/ai/types'
import type { TutoringSessionData } from '@/types'

// Matches the /live-transcript route's own cap (see
// app/api/tutoring-sessions/[id]/live-transcript/route.ts) — no point buffering
// more client-side than the server will ever store.
const FULL_TRANSCRIPT_MAX_CHARS = 20_000

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [session, setSession] = useState<TutoringSessionData | null>(null)
  const [sessionRole, setSessionRole] = useState<'tutor' | 'student'>('student')
  const [sessionLoading, setSessionLoading] = useState(true)
  const [inCall, setInCall] = useState(false)
  const [joining, setJoining] = useState(false)
  const [ending, setEnding] = useState(false)
  const [meetingToken, setMeetingToken] = useState('')
  const [roomUrl, setRoomUrl] = useState('')
  const [callFrame, setCallFrame] = useState<DailyCall | null>(null)
  const [whiteboardActive, setWhiteboardActive] = useState(false)
  // Once the board has ever been activated, it stays mounted for the rest of
  // the call — only its visibility toggles. Whiteboard previously unmounted on
  // `!whiteboardActive`, which called fabricCanvasRef.current.dispose() in its
  // cleanup: turning the board off and back on (or off before ending the
  // session) silently threw away everything drawn, on both the tutor's canvas
  // and the recap's whiteboardImage capture.
  const [whiteboardMounted, setWhiteboardMounted] = useState(false)
  const [remoteCanvasState, setRemoteCanvasState] = useState<string | null>(null)
  const whiteboardSnapshotRef = useRef<((opts?: { maxDim?: number }) => string | null) | null>(null)
  const whiteboardDrawRef = useRef<DrawFn | null>(null)
  // Recent-only window for the Visualize feature — it wants "what was just
  // discussed", not the whole lesson.
  const transcriptBufferRef = useRef<string[]>([])
  // Full-session buffer used as the transcript fallback if Daily's VTT never
  // comes back (see lib/session-processing.ts). Bounded by character count,
  // matching the /live-transcript route's own 20,000-char cap, rather than by
  // line count — the 40-line Visualize window would otherwise stand in for a
  // 60-minute lesson and the AI analysis would be built from its last minute
  // of dialogue with nothing signaling the truncation.
  const fullTranscriptBufferRef = useRef<string[]>([])
  const [showVisualize, setShowVisualize] = useState(false)
  const [livePracticeProblems, setLivePracticeProblems] = useState<PracticeProblem[]>([])
  const [studentAnswers, setStudentAnswers] = useState<Map<string, StudentAnswerResult>>(new Map())
  const [studentProblems, setStudentProblems] = useState<PracticeProblem[]>([])
  const [studentDismissed, setStudentDismissed] = useState(false)

  const isTutor = sessionRole === 'tutor'

  const { sendCanvasState, sendWhiteboardStart, sendWhiteboardStop } = useWhiteboardSync({
    callFrame,
    isTutor,
    onRemoteStateReceived: useCallback((json: string) => setRemoteCanvasState(json), []),
    onWhiteboardStarted: useCallback(() => setWhiteboardActive(true), []),
    onWhiteboardStopped: useCallback(() => setWhiteboardActive(false), []),
  })

  useEffect(() => {
    if (whiteboardActive) setWhiteboardMounted(true)
  }, [whiteboardActive])

  const [studentOverrides, setStudentOverrides] = useState<Set<string>>(new Set())
  const [assessmentActive, setAssessmentActive] = useState(false)

  const { sendProblems, sendAnswer, sendClear, sendOverride } = useLivePracticeSync({
    callFrame,
    isTutor,
    onProblemsReceived: useCallback((problems: PracticeProblem[]) => {
      setStudentProblems(problems)
      setStudentDismissed(false)
    }, []),
    onAnswerReceived: useCallback((result: StudentAnswerResult) => {
      setStudentAnswers((prev) => new Map(prev).set(result.problemId, result))
    }, []),
    onCleared: useCallback(() => {
      setStudentProblems([])
      setStudentDismissed(false)
      setStudentOverrides(new Set())
    }, []),
    onOverrideReceived: useCallback((problemId: string) => {
      setStudentOverrides((prev) => new Set(prev).add(problemId))
    }, []),
  })

  const handleSendToStudent = useCallback((problems: PracticeProblem[]) => {
    sendProblems(problems)
  }, [sendProblems])

  const handleClearProblems = useCallback(() => {
    setLivePracticeProblems([])
    setStudentAnswers(new Map())
    sendClear()
  }, [sendClear])

  const handleStudentAnswer = useCallback((result: StudentAnswerResult) => {
    sendAnswer(result)
  }, [sendAnswer])

  const handleOverride = useCallback(async (problemId: string, problemTopic: string) => {
    // Update mastery on the server FIRST. Marking the UI correct and telling
    // the student before knowing the write landed would leave the tutor and
    // the student both seeing "correct" while the recorded mastery disagrees —
    // and that number drives the practice sets generated after the session.
    try {
      const res = await fetch(`/api/tutoring-sessions/${id}/live-practice/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemTopic, problemId }),
      })
      if (!res.ok) {
        toast('Could not record that override. Please try again.', 'error')
        return
      }
    } catch {
      toast('Network error recording that override. Please try again.', 'error')
      return
    }

    // Update tutor-side display
    setStudentAnswers((prev) => {
      const next = new Map(prev)
      const existing = next.get(problemId)
      if (existing) next.set(problemId, { ...existing, correct: true })
      return next
    })
    // Notify student
    sendOverride(problemId)
  }, [id, sendOverride, toast])

  const toggleWhiteboard = useCallback(() => {
    // The side effect used to live inside the setState updater, which React
    // may invoke more than once per call (StrictMode double-invokes updaters
    // in dev) — the whiteboard start/stop signal could double-fire. Reading
    // the current value directly and sending the signal before the update is
    // both correct and no less current: this handler only ever runs from a
    // click, never during a render.
    if (whiteboardActive) {
      sendWhiteboardStop()
    } else {
      sendWhiteboardStart()
    }
    setWhiteboardActive((prev) => !prev)
  }, [whiteboardActive, sendWhiteboardStart, sendWhiteboardStop])

  // Start transcription when the tutor joins the call. If it can't start (e.g.
  // the Daily plan doesn't include transcription), tell the tutor so they know
  // the post-session recap will fall back to notes rather than the transcript.
  useEffect(() => {
    if (!callFrame || !isTutor) return

    const handleTranscriptionError = () => {
      toast('Transcription unavailable — the recap will use your notes instead.', 'error')
    }
    callFrame.on('transcription-error', handleTranscriptionError)

    Promise.resolve(callFrame.startTranscription()).catch(() => {
      toast('Transcription could not start — the recap will use your notes instead.', 'error')
    })

    return () => {
      try { callFrame.off('transcription-error', handleTranscriptionError) } catch { /* frame gone */ }
      try { callFrame.stopTranscription() } catch { /* frame already destroyed */ }
    }
  }, [callFrame, isTutor, toast])

  // Keep a rolling buffer of the recent conversation (tutor side) so the AI
  // "Visualize" feature can analyze what was just discussed. Captured only on
  // the tutor's client, which is the one that triggers visualization.
  useEffect(() => {
    if (!callFrame || !isTutor) return
    const onMsg = (ev: { text?: string; participantId?: string; rawResponse?: { is_final?: boolean } }) => {
      const text = typeof ev?.text === 'string' ? ev.text.trim() : ''
      // Daily has no top-level is_final; finality (when present) lives in
      // rawResponse. Skip interim partials so the buffer holds settled speech.
      if (!text || ev?.rawResponse?.is_final === false) return
      let speaker = 'Student'
      try {
        const local = callFrame.participants()?.local
        if (ev?.participantId && local && ev.participantId === local.session_id) speaker = 'Tutor'
      } catch { /* participants unavailable */ }
      const line = `${speaker}: ${text}`
      const buf = transcriptBufferRef.current
      if (buf[buf.length - 1] !== line) {
        buf.push(line)
        if (buf.length > 40) buf.shift()
      }

      const fullBuf = fullTranscriptBufferRef.current
      if (fullBuf[fullBuf.length - 1] !== line) {
        fullBuf.push(line)
        // Drop from the front once the joined text would exceed the cap, so
        // the fallback transcript stays a trailing window of the WHOLE
        // session rather than being pruned down to the last minute.
        while (fullBuf.length > 1 && fullBuf.join('\n').length > FULL_TRANSCRIPT_MAX_CHARS) {
          fullBuf.shift()
        }
      }
    }
    callFrame.on('transcription-message', onMsg)
    return () => { try { callFrame.off('transcription-message', onMsg) } catch { /* frame gone */ } }
  }, [callFrame, isTutor])

  const getVisualizeContext = useCallback(
    () => ({
      transcript: transcriptBufferRef.current.join('\n'),
      notes: '',
      // Downscaled, and null when the board is blank (skip a pointless image).
      whiteboardImage: whiteboardSnapshotRef.current?.({ maxDim: 1024 }) ?? null,
    }),
    [],
  )

  const placeVisualization = useCallback(async (svgs: string[], opts?: { replaceGroup?: string }) => {
    await whiteboardDrawRef.current?.(svgs, opts)
  }, [])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/tutoring-sessions/${id}`)
        if (res.ok) {
          const data = await res.json()
          setSession(data.session)
          setSessionRole(data.role)
        } else {
          if (res.status !== 404 && res.status !== 403) {
            toast('Could not load this session. Please try again.', 'error')
          }
          router.push('/dashboard')
        }
      } catch {
        toast('Network error loading the session.', 'error')
        router.push('/dashboard')
      } finally {
        setSessionLoading(false)
      }
    }
    if (user && id) fetchSession()
  }, [user, id, router, toast])

  // A student sitting on a scheduled session has no way to know when the tutor
  // starts it — the status only arrives with a page load. Poll while we're
  // waiting so the card flips to "Join Session" on its own, and stop as soon as
  // it does (or once the student is in the call).
  useEffect(() => {
    if (!user || !id) return
    if (isTutor || inCall) return
    if (session?.status !== 'scheduled') return

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/tutoring-sessions/${id}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.session?.status && data.session.status !== 'scheduled') {
          setSession(data.session)
        }
      } catch {
        // Transient — keep polling.
      }
    }, 10_000)

    return () => clearInterval(poll)
  }, [user, id, isTutor, inCall, session?.status])

  const fetchMeetingToken = useCallback(async (): Promise<boolean> => {
    const tokenRes = await fetch('/api/daily/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: id }),
    })
    if (tokenRes.ok) {
      const tokenData = await tokenRes.json()
      setMeetingToken(tokenData.token)
      setRoomUrl(tokenData.roomUrl)
      return true
    }
    return false
  }, [id])

  const startSession = useCallback(async () => {
    setJoining(true)
    try {
      // Activate session (creates Daily room)
      const patchRes = await fetch(`/api/tutoring-sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      if (!patchRes.ok) {
        toast('Could not start the session. Please try again.', 'error')
        return
      }

      const patchData = await patchRes.json()
      setSession((prev) => prev ? { ...prev, ...patchData.session } : prev)

      // Get meeting token — retry once if first attempt fails
      // (handles cold-start delays after room creation)
      let ok = await fetchMeetingToken()
      if (!ok) {
        await new Promise((r) => setTimeout(r, 2000))
        ok = await fetchMeetingToken()
      }
      if (ok) {
        setInCall(true)
      } else {
        toast('Could not connect to the video room. Please try again.', 'error')
      }
    } catch {
      toast('Something went wrong starting the session.', 'error')
    } finally {
      setJoining(false)
    }
  }, [id, fetchMeetingToken, toast])

  const joinSession = useCallback(async () => {
    setJoining(true)
    try {
      let ok = await fetchMeetingToken()
      if (!ok) {
        await new Promise((r) => setTimeout(r, 2000))
        ok = await fetchMeetingToken()
      }
      if (ok) {
        setInCall(true)
      } else {
        toast('Could not connect to the video room. Please try again.', 'error')
      }
    } catch {
      toast('Something went wrong joining the session.', 'error')
    } finally {
      setJoining(false)
    }
  }, [fetchMeetingToken, toast])

  const endSession = useCallback(async () => {
    setEnding(true)
    try {
      // Let the student's call leave immediately rather than sitting through the
      // reconnect grace window once the tutor's frame is torn down.
      try { callFrame?.sendAppMessage({ type: 'session:ended' }, '*') } catch { /* not joined */ }

      // Capture whiteboard snapshot before ending. Best-effort, like the
      // transcript below: a failed upload must not strand the tutor on an
      // active session — that blocks the analysis pipeline and leaves the
      // session open for the stale-session sweeper to close and bill.
      //
      // Gated on `whiteboardMounted`, not `whiteboardActive`: a tutor who drew
      // on the board and then hid the panel before ending still has content
      // worth capturing (the canvas is still alive — see whiteboardMounted).
      if (whiteboardMounted && whiteboardSnapshotRef.current) {
        try {
          const image = whiteboardSnapshotRef.current()
          if (image) {
            const base64 = image.replace(/^data:image\/\w+;base64,/, '')
            await fetch(`/api/tutoring-sessions/${id}/whiteboard`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: base64 }),
            })
          }
        } catch { /* non-critical — the recap just won't include the board */ }
      }

      // Persist the live-caption buffer as a transcript fallback (before /end,
      // so the async analysis pipeline sees it). Best-effort. Uses the
      // full-session buffer, not the 40-line Visualize window — the fallback
      // needs the whole lesson, not just its last minute.
      const liveTranscript = fullTranscriptBufferRef.current.join('\n')
      if (liveTranscript) {
        try {
          await fetch(`/api/tutoring-sessions/${id}/live-transcript`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: liveTranscript }),
          })
        } catch { /* non-critical */ }
      }

      const res = await fetch(`/api/tutoring-sessions/${id}/end`, { method: 'POST' })
      if (res.ok) {
        setInCall(false)
        router.push(`/session/${id}/review`)
      } else {
        toast('Could not end the session cleanly. Please try again.', 'error')
      }
    } catch {
      toast('Something went wrong ending the session.', 'error')
    } finally {
      setEnding(false)
    }
  }, [id, router, whiteboardMounted, callFrame, toast])

  const handleLeave = useCallback(() => {
    setInCall(false)
    if (sessionRole === 'student') {
      router.push('/dashboard')
    }
  }, [sessionRole, router])

  if (authLoading || sessionLoading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5]">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 py-16">
          <div className="mx-auto max-w-md space-y-4">
            <Skeleton className="h-8 w-2/3 mx-auto rounded-lg" />
            <Skeleton className="h-64 rounded-3xl" />
            <Skeleton className="h-11 w-40 mx-auto rounded-xl" />
          </div>
        </main>
      </div>
    )
  }

  if (!session) return null

  // Pre-call state
  if (!inCall) {
    return (
      <div className="min-h-screen bg-[#FFFBF5]">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 py-16">
          <JoinCallCard
            sessionId={id}
            topic={session.topic}
            studentName={session.student?.name || null}
            tutorName={session.tutor.name}
            status={session.status}
            isTutor={isTutor}
            onJoin={joinSession}
            onStart={startSession}
            joining={joining}
          />
        </main>
      </div>
    )
  }

  // In-call state
  return (
    <div className="h-screen flex flex-col bg-[#FFFBF5] overflow-hidden">
      <div className="p-3">
        <CallHeader
          topic={session.topic}
          startedAt={session.startedAt}
          onEndCall={endSession}
          ending={ending}
          isTutor={isTutor}
          whiteboardActive={whiteboardActive}
          onToggleWhiteboard={isTutor ? toggleWhiteboard : undefined}
        />
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0 px-3 pb-3 gap-3">
        {/* Video — main area */}
        <div className="flex-1 relative">
          <VideoCall
            roomUrl={roomUrl}
            token={meetingToken}
            onLeave={handleLeave}
            onCallFrame={setCallFrame}
          />
          {!isTutor && <CaptureNotesButton sessionId={id} />}
        </div>

        {/* Whiteboard — mounted once it's ever been activated, so toggling it
            off (or leaving it off before ending the session) never disposes
            the canvas. Only its visibility toggles with `whiteboardActive`. */}
        {whiteboardMounted && (
          <div className={`flex-1 relative ${whiteboardActive ? '' : 'hidden'}`}>
            <Whiteboard
              isTutor={isTutor}
              onCanvasStateChange={isTutor ? sendCanvasState : undefined}
              remoteCanvasState={!isTutor ? remoteCanvasState : undefined}
              snapshotRef={whiteboardSnapshotRef}
              drawRef={isTutor ? whiteboardDrawRef : undefined}
            />
            {isTutor && whiteboardActive && (
              <button
                onClick={() => setShowVisualize(true)}
                className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-xl bg-orange-500 text-white text-sm font-medium px-3 py-1.5 shadow-brand hover:bg-orange-600 transition-colors"
              >
                <span aria-hidden>✦</span> Visualize
              </button>
            )}
            {isTutor && whiteboardActive && showVisualize && (
              <VisualizePanel
                sessionId={id}
                getContext={getVisualizeContext}
                onPlace={placeVisualization}
                onClose={() => setShowVisualize(false)}
              />
            )}
          </div>
        )}

        {/* Sidebar — tutor gets Notes+Practice tabs, student gets problem panel */}
        {isTutor && (
          <div className="w-80 shrink-0">
            <SessionSidebar
              sessionId={id}
              initialNotes={session.tutorNotes}
              problems={livePracticeProblems}
              studentAnswers={studentAnswers}
              onProblemsGenerated={setLivePracticeProblems}
              onSendToStudent={handleSendToStudent}
              onClearProblems={handleClearProblems}
              onOverride={handleOverride}
              callFrame={callFrame}
              sessionTopic={session.topic}
            />
          </div>
        )}
        {!isTutor && (
          <>
            {/* Mounted even when hidden so its own load()/sync keep running and
                can flip assessmentActive back on — only its rendered width is
                conditional. */}
            <div className={assessmentActive ? 'w-80 shrink-0' : 'hidden'}>
              <AssessmentStudentPanel sessionId={id} callFrame={callFrame} onActiveChange={setAssessmentActive} />
            </div>
            {studentProblems.length > 0 && !studentDismissed && (
              <div className="w-80 shrink-0">
                <StudentProblemPanel
                  sessionId={id}
                  problems={studentProblems}
                  overrides={studentOverrides}
                  onAnswerSubmitted={handleStudentAnswer}
                  onDismiss={() => setStudentDismissed(true)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
