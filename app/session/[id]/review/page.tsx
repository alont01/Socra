'use client'

import { use, useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/useToast'
import { Navbar } from '@/components/Navbar'
import { AnalysisSummary } from '@/components/session/AnalysisSummary'
import { TranscriptViewer } from '@/components/session/TranscriptViewer'
import { TutorFeedbackCard } from '@/components/session/TutorFeedbackCard'
import { HomeworkManager } from '@/components/practice/HomeworkManager'
import { LoadingDots } from '@/components/ui/LoadingDots'
import { Skeleton } from '@/components/ui/Skeleton'
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
  const { toast } = useToast()
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

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
  }, [])

  const fetchTranscript = useCallback(async () => {
    try {
      const res = await fetch(`/api/tutoring-sessions/${id}/transcript`)
      if (res.ok) {
        const data = await res.json()
        setTranscript(data.transcript)
      }
    } catch {
      // Non-fatal — the analysis is the primary payload.
    }
  }, [id])

  // Poll the analysis endpoint until it's ready. If it never lands within the
  // window, surface a retryable error rather than a blank "ready" page.
  const pollForAnalysis = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tutoring-sessions/${id}/analysis`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'ready') {
          setAnalysis(data.analysis)
          setStatus('ready')
          stopPolling()
          // The transcript often finishes alongside the analysis — refresh it.
          fetchTranscript()
        }
      } catch {
        // Transient — keep polling.
      }
    }, 5000)
    // Transcript fetch can take up to ~3 min; give it 5 before giving up.
    timeoutRef.current = setTimeout(() => {
      stopPolling()
      setStatus((s) => (s === 'processing' ? 'error' : s))
    }, 300_000)
  }, [id, stopPolling, fetchTranscript])

  useEffect(() => {
    if (!user || !id) return

    const load = async () => {
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

        // Always load whatever transcript exists (independent of analysis state).
        await fetchTranscript()

        // Fetch analysis
        const analysisRes = await fetch(`/api/tutoring-sessions/${id}/analysis`)
        if (!analysisRes.ok) {
          setStatus('error')
          return
        }
        const data = await analysisRes.json()
        if (data.status === 'processing') {
          setStatus('processing')
          pollForAnalysis()
          return
        }
        setAnalysis(data.analysis)
        setStatus('ready')
      } catch {
        setStatus('error')
      }
    }

    load()

    return () => stopPolling()
  }, [user, id, fetchTranscript, pollForAnalysis, stopPolling])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5]">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-6 rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Skeleton className="h-48 rounded-3xl" />
              <Skeleton className="h-40 rounded-3xl" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-48 rounded-3xl" />
              <Skeleton className="h-40 rounded-3xl" />
            </div>
          </div>
        </main>
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
        pollForAnalysis()
      } else {
        const data = await res.json().catch(() => ({}))
        toast(data.error || 'Could not retry the analysis. Please try again.', 'error')
      }
    } catch {
      toast('Network error retrying the analysis.', 'error')
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Skeleton className="h-48 rounded-3xl" />
              <Skeleton className="h-40 rounded-3xl" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-48 rounded-3xl" />
              <Skeleton className="h-40 rounded-3xl" />
            </div>
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
            <p className="text-red-600 mb-1">We couldn&apos;t generate the analysis for this session.</p>
            <p className="text-sm text-stone-500 mb-4">
              The transcript may still be processing, or there wasn&apos;t enough captured to analyze.
            </p>
            {isTutor && (
              <button
                onClick={retryAnalysis}
                disabled={retrying}
                className="inline-flex items-center rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {retrying ? 'Retrying…' : 'Retry analysis'}
              </button>
            )}
          </div>
        )}

        {status === 'ready' && !analysis && (
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-8 text-center">
            <p className="text-stone-600 mb-4">No analysis is available for this session yet.</p>
            {isTutor && (
              <button
                onClick={retryAnalysis}
                disabled={retrying}
                className="inline-flex items-center rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {retrying ? 'Retrying…' : 'Retry analysis'}
              </button>
            )}
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
                {/* Base64 data URL — next/image can't optimize these and needs
                    fixed dimensions, so a plain <img> is the right tool here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
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
