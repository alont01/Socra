'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { VideoCall } from '@/components/session/VideoCall'
import { CallHeader } from '@/components/session/CallHeader'
import { SessionSidebar } from '@/components/session/SessionSidebar'
import { StudentProblemPanel } from '@/components/session/StudentProblemPanel'
import { JoinCallCard } from '@/components/session/JoinCallCard'
import { CaptureNotesButton } from '@/components/session/CaptureNotesButton'
import { Whiteboard } from '@/components/session/Whiteboard'
import { useWhiteboardSync } from '@/hooks/useWhiteboardSync'
import { useLivePracticeSync } from '@/hooks/useLivePracticeSync'
import type { StudentAnswerResult } from '@/hooks/useLivePracticeSync'
import { LoadingDots } from '@/components/ui/LoadingDots'
import { Navbar } from '@/components/Navbar'
import type { DailyCall } from '@daily-co/daily-js'
import type { PracticeProblem } from '@/lib/ai/types'
import type { TutoringSessionData } from '@/types'

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
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
  const [remoteCanvasState, setRemoteCanvasState] = useState<string | null>(null)
  const whiteboardSnapshotRef = useRef<(() => string | null) | null>(null)
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

  const [studentOverrides, setStudentOverrides] = useState<Set<string>>(new Set())

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
    // Update mastery on the server
    await fetch(`/api/tutoring-sessions/${id}/live-practice/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problemTopic }),
    })
    // Update tutor-side display
    setStudentAnswers((prev) => {
      const next = new Map(prev)
      const existing = next.get(problemId)
      if (existing) next.set(problemId, { ...existing, correct: true })
      return next
    })
    // Notify student
    sendOverride(problemId)
  }, [id, sendOverride])

  const toggleWhiteboard = useCallback(() => {
    setWhiteboardActive((prev) => {
      if (prev) {
        sendWhiteboardStop()
      } else {
        sendWhiteboardStart()
      }
      return !prev
    })
  }, [sendWhiteboardStart, sendWhiteboardStop])

  // Start transcription when the tutor joins the call
  useEffect(() => {
    if (!callFrame || !isTutor) return
    callFrame.startTranscription()
    return () => {
      try { callFrame.stopTranscription() } catch { /* frame already destroyed */ }
    }
  }, [callFrame, isTutor])

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
          router.push('/dashboard')
        }
      } finally {
        setSessionLoading(false)
      }
    }
    if (user && id) fetchSession()
  }, [user, id, router])

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
      if (!patchRes.ok) return

      const patchData = await patchRes.json()
      setSession((prev) => prev ? { ...prev, ...patchData.session } : prev)

      // Get meeting token — retry once if first attempt fails
      // (handles cold-start delays after room creation)
      let ok = await fetchMeetingToken()
      if (!ok) {
        await new Promise((r) => setTimeout(r, 2000))
        ok = await fetchMeetingToken()
      }
      if (ok) setInCall(true)
    } finally {
      setJoining(false)
    }
  }, [id, fetchMeetingToken])

  const joinSession = useCallback(async () => {
    setJoining(true)
    try {
      let ok = await fetchMeetingToken()
      if (!ok) {
        await new Promise((r) => setTimeout(r, 2000))
        ok = await fetchMeetingToken()
      }
      if (ok) setInCall(true)
    } finally {
      setJoining(false)
    }
  }, [fetchMeetingToken])

  const endSession = useCallback(async () => {
    setEnding(true)
    try {
      // Capture whiteboard snapshot before ending
      if (whiteboardActive && whiteboardSnapshotRef.current) {
        const image = whiteboardSnapshotRef.current()
        if (image) {
          const base64 = image.replace(/^data:image\/\w+;base64,/, '')
          await fetch(`/api/tutoring-sessions/${id}/whiteboard`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64 }),
          })
        }
      }

      const res = await fetch(`/api/tutoring-sessions/${id}/end`, { method: 'POST' })
      if (res.ok) {
        setInCall(false)
        router.push(`/session/${id}/review`)
      }
    } finally {
      setEnding(false)
    }
  }, [id, router, whiteboardActive])

  const handleLeave = useCallback(() => {
    setInCall(false)
    if (sessionRole === 'student') {
      router.push('/dashboard')
    }
  }, [sessionRole, router])

  if (authLoading || sessionLoading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <LoadingDots />
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

        {/* Whiteboard — shown when active */}
        {whiteboardActive && (
          <div className="flex-1">
            <Whiteboard
              isTutor={isTutor}
              onCanvasStateChange={isTutor ? sendCanvasState : undefined}
              remoteCanvasState={!isTutor ? remoteCanvasState : undefined}
              snapshotRef={whiteboardSnapshotRef}
            />
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
            />
          </div>
        )}
        {!isTutor && studentProblems.length > 0 && !studentDismissed && (
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
      </div>
    </div>
  )
}
