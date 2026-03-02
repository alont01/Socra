'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { VideoCall } from '@/components/session/VideoCall'
import { CallHeader } from '@/components/session/CallHeader'
import { NotesSidebar } from '@/components/session/NotesSidebar'
import { JoinCallCard } from '@/components/session/JoinCallCard'
import { LoadingDots } from '@/components/ui/LoadingDots'
import { Navbar } from '@/components/Navbar'

interface TutoringSessionData {
  id: string
  topic: string
  status: string
  startedAt: string | null
  dailyRoomUrl: string | null
  dailyRoomName: string | null
  tutorNotes: string
  tutor: { id: string; name: string; userId: string }
  student: { id: string; name: string; gradeLevel: string; userId: string } | null
}

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

      // Get meeting token
      const tokenRes = await fetch('/api/daily/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
      })
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json()
        setMeetingToken(tokenData.token)
        setRoomUrl(tokenData.roomUrl)
        setInCall(true)
      }
    } finally {
      setJoining(false)
    }
  }, [id])

  const joinSession = useCallback(async () => {
    setJoining(true)
    try {
      const tokenRes = await fetch('/api/daily/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
      })
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json()
        setMeetingToken(tokenData.token)
        setRoomUrl(tokenData.roomUrl)
        setInCall(true)
      }
    } finally {
      setJoining(false)
    }
  }, [id])

  const endSession = useCallback(async () => {
    setEnding(true)
    try {
      const res = await fetch(`/api/tutoring-sessions/${id}/end`, { method: 'POST' })
      if (res.ok) {
        setInCall(false)
        router.push(`/session/${id}/review`)
      }
    } finally {
      setEnding(false)
    }
  }, [id, router])

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

  const isTutor = sessionRole === 'tutor'

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
        />
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0 px-3 pb-3 gap-3">
        {/* Video — main area */}
        <div className="flex-1">
          <VideoCall
            roomUrl={roomUrl}
            token={meetingToken}
            onLeave={handleLeave}
          />
        </div>

        {/* Notes — sidebar (tutor only) */}
        {isTutor && (
          <div className="w-80 shrink-0">
            <NotesSidebar sessionId={id} initialNotes={session.tutorNotes} />
          </div>
        )}
      </div>
    </div>
  )
}
