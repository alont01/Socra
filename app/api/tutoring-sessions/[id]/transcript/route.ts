import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'
import { route } from '@/lib/api-handler'

export const GET = route('tutoring-sessions/[id]/transcript', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
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
})
