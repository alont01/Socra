'use client'

import { use, useEffect, useState, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { AnalysisSummary } from '@/components/session/AnalysisSummary'
import { TranscriptViewer } from '@/components/session/TranscriptViewer'
import { TutorFeedbackCard } from '@/components/session/TutorFeedbackCard'
import { HomeworkManager } from '@/components/practice/HomeworkManager'
import { LoadingDots } from '@/components/ui/LoadingDots'
import Link from 'next/link'
import type { AnalysisData, TranscriptData } from '@/types'

export default function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
  const [transcript, setTranscript] = useState<TranscriptData | null>(null)
  const [whiteboardImage, setWhiteboardImage] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'processing' | 'ready' | 'error'>('loading')
  const [sessionRole, setSessionRole] = useState<'tutor' | 'student'>('student')
  const [retrying, setRetrying] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user || !id) return

    const fetchData = async () => {
      try {
        // Fetch session info to determine role
        const sessionRes = await fetch(`/api/tutoring-sessions/${id}`)
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json()
          setSessionRole(sessionData.role)
          if (sessionData.session?.whiteboardImage) {
            setWhiteboardImage(sessionData.session.whiteboardImage)
          }
        }

        // Fetch analysis
        const analysisRes = await fetch(`/api/tutoring-sessions/${id}/analysis`)
        if (analysisRes.ok) {
          const data = await analysisRes.json()
          if (data.status === 'processing') {
            setStatus('processing')
            // Poll for completion — clean up on unmount
            pollRef.current = setInterval(async () => {
              const retry = await fetch(`/api/tutoring-sessions/${id}/analysis`)
              if (retry.ok) {
                const retryData = await retry.json()
                if (retryData.status === 'ready') {
                  setAnalysis(retryData.analysis)
                  setStatus('ready')
                  if (pollRef.current) clearInterval(pollRef.current)
                  if (timeoutRef.current) clearTimeout(timeoutRef.current)
                }
              }
            }, 5000)
            // Stop polling after 5 minutes (transcript fetch can take up to 3 min)
            timeoutRef.current = setTimeout(() => {
              if (pollRef.current) clearInterval(pollRef.current)
              setStatus('ready')
            }, 300_000)
            return
          }
          setAnalysis(data.analysis)
          setStatus('ready')
        }

        // Fetch transcript
        const transcriptRes = await fetch(`/api/tutoring-sessions/${id}/transcript`)
        if (transcriptRes.ok) {
          const tData = await transcriptRes.json()
          setTranscript(tData.transcript)
        }
      } catch {
        setStatus('error')
      }
    }

    fetchData()

    // Cleanup polling on unmount
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [user, id])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <LoadingDots />
      </div>
    )
  }

  const isTutor = sessionRole === 'tutor'
  const hasTranscript = transcript && transcript.content && transcript.content.trim().length > 0

  const retryAnalysis = async () => {
    setRetrying(true)
    try {
      const res = await fetch(`/api/tutoring-sessions/${id}/retry-analysis`, { method: 'POST' })
      if (res.ok) {
        setStatus('processing')
        setAnalysis(null)
        setTranscript(null)
        // Re-poll for completion
        pollRef.current = setInterval(async () => {
          const retry = await fetch(`/api/tutoring-sessions/${id}/analysis`)
          if (retry.ok) {
            const retryData = await retry.json()
            if (retryData.status === 'ready') {
              setAnalysis(retryData.analysis)
              setStatus('ready')
              if (pollRef.current) clearInterval(pollRef.current)
              if (timeoutRef.current) clearTimeout(timeoutRef.current)
              // Re-fetch transcript
              const tRes = await fetch(`/api/tutoring-sessions/${id}/transcript`)
              if (tRes.ok) {
                const tData = await tRes.json()
                setTranscript(tData.transcript)
              }
            }
          }
        }, 5000)
        timeoutRef.current = setTimeout(() => {
          if (pollRef.current) clearInterval(pollRef.current)
          setStatus('ready')
        }, 300_000)
      }
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-stone-900">Session Review</h1>
          <Link href="/dashboard" className="text-sm text-orange-500 hover:text-orange-600">
            Back to Dashboard
          </Link>
        </div>

        {status === 'loading' && (
          <div className="flex justify-center py-12">
            <LoadingDots />
          </div>
        )}

        {status === 'processing' && (
          <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-8 text-center">
            <LoadingDots />
            <p className="text-stone-500 mt-4">Analyzing your session...</p>
            <p className="text-xs text-stone-400 mt-1">This may take a few minutes while the transcript is processed.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-8 text-center">
            <p className="text-red-600">Something went wrong loading the review.</p>
          </div>
        )}

        {status === 'ready' && analysis && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left column: transcript + student feedback */}
              <div className="space-y-6">
                {hasTranscript ? (
                  <TranscriptViewer
                    content={transcript.content}
                    speakers={transcript.speakers}
                  />
                ) : isTutor && (
                  <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-6">
                    <h3 className="font-semibold text-stone-900 mb-2">Transcript</h3>
                    <p className="text-sm text-stone-500 mb-3">
                      No transcript was captured for this session. The transcript may still be processing — try retrying in a minute or two.
                    </p>
                    <button
                      onClick={retryAnalysis}
                      disabled={retrying}
                      className="text-sm text-orange-500 hover:text-orange-600 font-medium disabled:opacity-50"
                    >
                      {retrying ? 'Retrying...' : 'Retry analysis'}
                    </button>
                  </div>
                )}
                <AnalysisSummary
                  summary={analysis.summary}
                  conceptsCovered={analysis.conceptsCovered}
                  studentStrengths={analysis.studentStrengths}
                  studentGaps={analysis.studentGaps}
                />
              </div>

              {/* Right column: tutor feedback + homework */}
              {isTutor && (
                <div className="space-y-6">
                  <TutorFeedbackCard feedback={analysis.tutorFeedback} />
                  <HomeworkManager sessionId={id} />
                </div>
              )}
            </div>

            {whiteboardImage && (
              <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6">
                <h3 className="font-semibold text-stone-900 mb-3">Whiteboard</h3>
                <img
                  src={`data:image/png;base64,${whiteboardImage}`}
                  alt="Session whiteboard"
                  className="w-full rounded-lg border border-stone-200"
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
