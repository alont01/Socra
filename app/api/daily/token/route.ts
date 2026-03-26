import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getMeetingToken } from '@/lib/daily'

export async function POST(request: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

    const { sessionId } = await request.json()
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

    const session = await prisma.tutoringSession.findUnique({
      where: { id: sessionId },
      include: {
        tutor: true,
        student: true,
      },
    })

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (!session.dailyRoomName) return NextResponse.json({ error: 'No room created yet' }, { status: 400 })

    // Verify user is either the tutor or the student
    const isTutor = session.tutor.userId === auth.payload.userId
    const isStudent = session.student?.userId === auth.payload.userId

    if (!isTutor && !isStudent) {
      return NextResponse.json({ error: 'Not authorized for this session' }, { status: 403 })
    }

    const userName = isTutor ? session.tutor.name : (session.student?.name || 'Student')
    const meetingToken = await getMeetingToken(session.dailyRoomName, userName, isTutor)

    return NextResponse.json({ token: meetingToken, roomUrl: session.dailyRoomUrl })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
