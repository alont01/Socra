import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createRoom } from '@/lib/daily'
import { updateSessionSchema, parseBody } from '@/lib/validations'
import { route } from '@/lib/api-handler'

export const GET = route('tutoring-sessions/[id]', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

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
  const isTutor = session.tutor.userId === auth.payload.userId
  const isStudent = session.student?.userId === auth.payload.userId
  if (!isTutor && !isStudent) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // tutorNotes are private to the tutor — never expose them to the student.
  if (!isTutor) {
    const { tutorNotes: _tutorNotes, ...studentView } = session
    return NextResponse.json({ session: studentView, role: 'student' })
  }

  return NextResponse.json({ session, role: 'tutor' })
})

export const PATCH = route('tutoring-sessions/[id]', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const session = await prisma.tutoringSession.findUnique({
    where: { id },
    include: { tutor: true },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.tutor.userId !== auth.payload.userId) {
    return NextResponse.json({ error: 'Only tutor can update session' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = parseBody(updateSessionSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { tutorNotes, topic, status } = parsed.data
  const updateData: Record<string, unknown> = {}

  if (tutorNotes !== undefined) updateData.tutorNotes = tutorNotes
  if (topic !== undefined) updateData.topic = topic
  if (status !== undefined) {
    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      scheduled: ['active', 'cancelled'],
      active: ['completed', 'cancelled'],
      completed: [],    // terminal state
      cancelled: [],    // terminal state
    }
    const allowed = validTransitions[session.status] || []
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${session.status}' to '${status}'` },
        { status: 400 },
      )
    }
    updateData.status = status
  }

  // If setting to active and no room yet, create one
  if (status === 'active' && !session.dailyRoomName) {
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
})
