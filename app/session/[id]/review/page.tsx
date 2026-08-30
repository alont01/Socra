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
  // Notes are editable here so the "add notes, then retry" advice on an
  // insufficient-content session is something the tutor can actually act on —
  // notes feed the same analysis pipeline as the transcript.
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  // 'failed' / 'insufficient' are real server-reported states now, not the
  // client's guess: the pipeline writes a placeholder analysis row and the API
  // reports why. They used to arrive as status 'ready' with apology text in the
  // summary field, which rendered as though it were the recap.
  const [status, setStatus] = useState<'loading' | 'processing' | 'ready' | 'failed' | 'insufficient' | 'no_student' | 'error'>('loading')
  const [sessionRole, setSessionRole] = useState<'tutor' | 'student'>('student')
  const [retrying, setRetrying] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const giveUpRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth')
    }
  }, [user, authLoading, router])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    if (giveUpRef.current) { clearTimeout(giveUpRef.current); giveUpRef.current = null }
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
        } else if (data.status === 'failed' || data.status === 'insufficient') {
          // The pipeline finished and reached a placeholder. Polling on would
          // just spin for five minutes before showing the same thing.
          setAnalysis(null)
          setStatus(data.status)
          stopPolling()
          fetchTranscript()
        }
      } catch {
        // Transient — keep polling.
      }
    }, 5000)
    // Transcript fetch can take up to ~3 min; the tutor shouldn't be staring
    // at a bare spinner past 5, so surface a retryable error at that point.
    // The 5s poll above is intentionally NOT stopped here: a pipeline that was
    // just slow (not actually stuck) still lands a little after 5 min, and
    // without this the page latched on "couldn't generate" permanently —
    // nothing ever polled again, so a tutor who didn't manually retry never
    // saw the recap that in fact existed 30 seconds later. This lets that
    // late arrival flip the page to 'ready' on its own.
    timeoutRef.current = setTimeout(() => {
      setStatus((s) => (s === 'processing' ? 'error' : s))
    }, 300_000)
    // A genuinely dead pipeline shouldn't poll the tab forever, though —
    // give up for real well past any realistic finish time.
    giveUpRef.current = setTimeout(() => {
      stopPolling()
    }, 30 * 60_000)
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
          // Only present for the tutor — the API strips it for students.
          if (typeof sessionData.session?.tutorNotes === 'string') {
            setNotes(sessionData.session.tutorNotes)
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
        if (data.status === 'failed' || data.status === 'insufficient' || data.status === 'no_student') {
          setAnalysis(null)
          setStatus(data.status)
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

  // Save notes and retry in one action: retrying without persisting the notes
  // the tutor just typed would re-run the pipeline against the same empty
  // session and fail again for exactly the same reason.
  const saveNotesAndRetry = async () => {
    setSavingNotes(true)
    try {
      const res = await fetch(`/api/tutoring-sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorNotes: notes }),
      })
      if (!res.ok) {
        toast('Could not save your notes — nothing was retried.', 'error')
        return
      }
    } catch {
      toast('Network error saving your notes.', 'error')
      return
    } finally {
      setSavingNotes(false)
    }
    await retryAnalysis()
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

        {/* The pipeline produced a placeholder, not a recap. The tutor gets the
            reason and the retry; the student gets a plain, honest message
            instead of an apology dressed up as their lesson summary. */}
        {(status === 'failed' || status === 'insufficient') && (
          <div className="bg-white rounded-3xl ring-1 ring-amber-100 shadow-soft p-8 text-center">
            <div className="mx-auto mb-3 grid place-items-center h-12 w-12 rounded-2xl bg-amber-100 text-amber-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" />
              </svg>
            </div>
            {isTutor ? (
              <>
                <p className="text-stone-900 font-semibold mb-1">
                  {status === 'insufficient'
                    ? 'Not enough was captured to write a recap'
                    : 'The recap couldn’t be generated'}
                </p>
                <p className="text-sm text-stone-500 mb-4 max-w-md mx-auto">
                  {status === 'insufficient'
                    ? 'There was no transcript, notes, or whiteboard to work from. Write down what you covered and retry — the recap and the homework set are both generated from this.'
                    : 'This was a problem on our side, not with your session. The transcript and notes are safe; retrying usually works.'}
                </p>

                {status === 'insufficient' ? (
                  <div className="max-w-md mx-auto text-left">
                    <label htmlFor="recap-notes" className="text-sm font-medium text-stone-700 block mb-1.5">
                      Session notes
                    </label>
                    <textarea
                      id="recap-notes"
                      rows={5}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="We worked through factoring quadratics. Maya was solid on pulling out a common factor but got stuck when the leading coefficient wasn't 1…"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white text-stone-900 placeholder-stone-400 ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-y text-sm"
                    />
                    <button
                      onClick={saveNotesAndRetry}
                      disabled={retrying || savingNotes || !notes.trim()}
                      className="mt-3 inline-flex items-center rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                    >
                      {savingNotes ? 'Saving…' : retrying ? 'Retrying…' : 'Save notes & retry'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={retryAnalysis}
                    disabled={retrying}
                    className="inline-flex items-center rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {retrying ? 'Retrying…' : 'Retry analysis'}
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-stone-900 font-semibold mb-1">No recap for this session</p>
                <p className="text-sm text-stone-500 max-w-md mx-auto">
                  A summary wasn&apos;t generated for this one. Your tutor can regenerate it — everything else about your progress is unaffected.
                </p>
              </>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-8 text-center">
            <p className="text-red-600 mb-1">This is taking longer than usual.</p>
            <p className="text-sm text-stone-500 mb-4">
              The analysis may still be processing in the background — this page will update on its own if it finishes. If it&apos;s been a while, try again below.
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

        {/* Open session with no student on the roster — there is nothing to
            analyze (no mastery to update, no homework to target), so this is a
            genuine end state, not a failure the tutor can retry their way out
            of. */}
        {status === 'no_student' && (
          <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-8 text-center">
            <div className="mx-auto mb-3 grid place-items-center h-12 w-12 rounded-2xl bg-stone-100 text-stone-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
              </svg>
            </div>
            <p className="text-stone-900 font-semibold mb-1">No recap for this session</p>
            <p className="text-sm text-stone-500 max-w-md mx-auto mb-4">
              This was an open session with no student assigned, so there&apos;s no recap or homework to generate.
              {hasTranscript ? ' The transcript below is still available.' : ''}
            </p>
            <Link href="/dashboard" className="inline-block text-sm font-semibold text-orange-600 hover:text-orange-700">
              Back to dashboard →
            </Link>
          </div>
        )}

        {status === 'no_student' && hasTranscript && (
          <div className="mt-6">
            <TranscriptViewer content={transcript!.content} speakers={transcript!.speakers} />
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
