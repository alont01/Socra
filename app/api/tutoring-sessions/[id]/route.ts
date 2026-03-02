import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createRoom } from '@/lib/daily'

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
        tutor: { select: { id: true, name: true, userId: true } },
        student: { select: { id: true, name: true, gradeLevel: true, userId: true } },
        analysis: true,
      },
    })

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    // Verify access
    const isTutor = session.tutor.userId === payload.userId
    const isStudent = session.student?.userId === payload.userId
    if (!isTutor && !isStudent) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    return NextResponse.json({ session, role: isTutor ? 'tutor' : 'student' })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
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
      include: { tutor: true },
    })

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.tutor.userId !== payload.userId) {
      return NextResponse.json({ error: 'Only tutor can update session' }, { status: 403 })
    }

    const body = await request.json()
    const updateData: Record<string, unknown> = {}

    if (body.tutorNotes !== undefined) updateData.tutorNotes = body.tutorNotes
    if (body.topic !== undefined) updateData.topic = body.topic
    if (body.status !== undefined) updateData.status = body.status

    // If setting to active and no room yet, create one
    if (body.status === 'active' && !session.dailyRoomName) {
      const room = await createRoom(id)
      updateData.dailyRoomName = room.name
      updateData.dailyRoomUrl = room.url
      updateData.startedAt = new Date()
    }

    const updated = await prisma.tutoringSession.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ session: updated })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
