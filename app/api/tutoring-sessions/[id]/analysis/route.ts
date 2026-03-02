import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    const isTutor = session.tutor.userId === payload.userId
    const isStudent = session.student?.userId === payload.userId
    if (!isTutor && !isStudent) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    if (!session.analysis) {
      return NextResponse.json({ analysis: null, status: 'processing' })
    }

    return NextResponse.json({
      analysis: {
        summary: session.analysis.summary,
        conceptsCovered: JSON.parse(session.analysis.conceptsCovered),
        studentStrengths: JSON.parse(session.analysis.studentStrengths),
        studentGaps: JSON.parse(session.analysis.studentGaps),
        tutorFeedback: session.analysis.tutorFeedback,
      },
      practiceSets: session.practiceSets.map((ps) => ({
        id: ps.id,
        title: ps.title,
        problemCount: JSON.parse(ps.problems).length,
      })),
      status: 'ready',
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
