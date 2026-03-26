import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

    const session = await prisma.tutoringSession.findUnique({
      where: { id },
      include: {
        tutor: { select: { userId: true } },
        student: { select: { userId: true } },
        analysis: true,
        practiceSets: true,
      },
    })

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const isTutor = session.tutor.userId === auth.payload.userId
    const isStudent = session.student?.userId === auth.payload.userId
    if (!isTutor && !isStudent) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    if (!session.analysis) {
      return NextResponse.json({ analysis: null, status: 'processing' })
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
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
