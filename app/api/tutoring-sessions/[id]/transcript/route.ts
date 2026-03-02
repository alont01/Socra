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
        transcript: true,
      },
    })

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const isTutor = session.tutor.userId === payload.userId
    const isStudent = session.student?.userId === payload.userId
    if (!isTutor && !isStudent) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    return NextResponse.json({
      transcript: session.transcript ? {
        content: session.transcript.content,
        speakers: JSON.parse(session.transcript.speakers),
        durationSeconds: session.transcript.durationSeconds,
      } : null,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
