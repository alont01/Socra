import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getMeetingToken } from '@/lib/daily'
import { route } from '@/lib/api-handler'
import { dailyTokenSchema, parseBody } from '@/lib/validations'

export const POST = route('daily/token', async (request: Request) => {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const body = await request.json()
  const parsed = parseBody(dailyTokenSchema, body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { sessionId } = parsed.data

  const session = await prisma.tutoringSession.findUnique({
    where: { id: sessionId },
    include: {
      tutor: true,
      student: true,
    },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!session.dailyRoomName) return NextResponse.json({ error: 'No room created yet' }, { status: 400 })
  // Don't mint join tokens for sessions that are over — the room may still be
  // alive until it expires, but nobody should be able to (re)enter.
  if (session.status !== 'active') {
    return NextResponse.json({ error: 'This session is not active' }, { status: 400 })
  }

  // Verify user is either the tutor or the student
  const isTutor = session.tutor.userId === auth.payload.userId
  const isStudent = session.student?.userId === auth.payload.userId

  if (!isTutor && !isStudent) {
    return NextResponse.json({ error: 'Not authorized for this session' }, { status: 403 })
  }

  const userName = isTutor ? session.tutor.name : (session.student?.name || 'Student')
  const meetingToken = await getMeetingToken(session.dailyRoomName, userName, isTutor)

  return NextResponse.json({ token: meetingToken, roomUrl: session.dailyRoomUrl })
})
