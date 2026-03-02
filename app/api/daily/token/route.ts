import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getMeetingToken } from '@/lib/daily'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    const isTutor = session.tutor.userId === payload.userId
    const isStudent = session.student?.userId === payload.userId

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
