import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'
import { route } from '@/lib/api-handler'

export const GET = route('tutoring-sessions/[id]/analysis', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const session = await prisma.tutoringSession.findUnique({
    where: { id },
    include: {
      tutor: { select: { userId: true } },
      student: { select: { userId: true } },
      analysis: true,
      // Only assigned homework is shown here; drafts are managed via the
      // tutor practice-sets endpoint and must not surface to students.
      practiceSets: { where: { status: 'assigned' } },
    },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const isTutor = session.tutor.userId === auth.payload.userId
  const isStudent = session.student?.userId === auth.payload.userId
  if (!isTutor && !isStudent) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!session.analysis) {
    // An open session (no student on the roster) never produces a recap:
    // processSessionPostCompletion returns before writing any analysis row,
    // so `processing` here would spin forever and every "Retry analysis"
    // would silently re-hit the same early return. Report a terminal state
    // the review page can render without offering a retry that can't work.
    if (!session.studentId && session.status === 'completed') {
      return NextResponse.json({ analysis: null, status: 'no_student' })
    }
    return NextResponse.json({ analysis: null, status: 'processing' })
  }

  // A placeholder row is not a recap. Reporting it as 'ready' is what let
  // "Analysis could not be generated" render as the session summary — and
  // reach parents as their child's lesson. Callers get the reason instead, and
  // `analysis` stays null so nothing can accidentally display the text.
  if (session.analysis.status !== 'ok') {
    return NextResponse.json({
      analysis: null,
      status: session.analysis.status === 'insufficient' ? 'insufficient' : 'failed',
    })
  }

  return NextResponse.json({
    analysis: {
      summary: session.analysis.summary,
      conceptsCovered: safeJsonParse(session.analysis.conceptsCovered, []),
      studentStrengths: safeJsonParse(session.analysis.studentStrengths, []),
      studentGaps: safeJsonParse(session.analysis.studentGaps, []),
      tutorFeedback: session.analysis.tutorFeedback,
    },
    practiceSets: session.practiceSets.map((ps) => ({
      id: ps.id,
      title: ps.title,
      problemCount: safeJsonParse<unknown[]>(ps.problems, []).length,
    })),
    status: 'ready',
  })
})
