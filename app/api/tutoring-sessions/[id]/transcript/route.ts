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
        transcript: true,
      },
    })

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const isTutor = session.tutor.userId === auth.payload.userId
    const isStudent = session.student?.userId === auth.payload.userId
    if (!isTutor && !isStudent) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    return NextResponse.json({
      transcript: session.transcript ? {
        content: session.transcript.content,
        speakers: safeJsonParse(session.transcript.speakers, []),
        durationSeconds: session.transcript.durationSeconds,
      } : null,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
