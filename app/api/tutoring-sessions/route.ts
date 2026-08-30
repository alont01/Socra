import { NextResponse } from 'next/server'
import { requireAuth, requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { notifySessionScheduled } from '@/lib/session-notify'
import { route } from '@/lib/api-handler'
import { createSessionSchema, parseBody } from '@/lib/validations'
import { config } from '@/lib/config'

export const GET = route('tutoring-sessions', async (request: Request) => {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const take = Math.min(Number(searchParams.get('limit')) || 50, 100)
  const cursor = searchParams.get('cursor') || undefined

  // Explicit scalar allowlist — never ship tutorNotes, capturedNotes, or the
  // (large, base64) whiteboardImage to a list view. tutorNotes in particular
  // must not reach students.
  const listFields = {
    id: true,
    topic: true,
    status: true,
    scheduledAt: true,
    startedAt: true,
    createdAt: true,
  } as const

  const paginationArgs = {
    take: take + 1, // fetch one extra to detect next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' as const },
  }

  let sessions

  if (auth.payload.role === 'TUTOR') {
    const tutor = await prisma.tutorProfile.findUnique({ where: { userId: auth.payload.userId } })
    if (!tutor) return NextResponse.json({ error: 'Not a tutor' }, { status: 403 })

    sessions = await prisma.tutoringSession.findMany({
      where: { tutorId: tutor.id },
      select: {
        ...listFields,
        student: { select: { id: true, name: true, gradeLevel: true } },
      },
      ...paginationArgs,
    })
  } else {
    const student = await prisma.studentProfile.findUnique({ where: { userId: auth.payload.userId } })
    if (!student) return NextResponse.json({ error: 'Not a student' }, { status: 403 })

    sessions = await prisma.tutoringSession.findMany({
      where: { studentId: student.id },
      select: {
        ...listFields,
        tutor: { select: { id: true, name: true } },
      },
      ...paginationArgs,
    })
  }

  const hasMore = sessions.length > take
  if (hasMore) sessions.pop()
  const nextCursor = hasMore ? sessions[sessions.length - 1]?.id : null

  return NextResponse.json({ sessions, nextCursor })
})

export const POST = route('tutoring-sessions', async (request: Request) => {
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const body = await request.json()
  const parsed = parseBody(createSessionSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { studentId, topic, scheduledAt, scheduledMinutes } = parsed.data

  // Validate student is in tutor's roster. A row with status 'ended' (the
  // tutor previously dropped this student) still matches the composite key
  // lookup — without the status check here, a tutor could keep creating
  // billable sessions for a student they no longer have on their roster.
  if (studentId) {
    const rosterEntry = await prisma.tutorStudent.findUnique({
      where: { tutorId_studentId: { tutorId: auth.tutor.id, studentId } },
    })
    if (!rosterEntry || rosterEntry.status !== 'active') {
      return NextResponse.json({ error: 'Student is not in your roster' }, { status: 403 })
    }
  }

  const session = await prisma.tutoringSession.create({
    data: {
      tutorId: auth.tutor.id,
      studentId: studentId || null,
      topic: topic || '',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      scheduledMinutes: scheduledMinutes ?? config.billing.defaultSessionMinutes,
    },
    include: {
      student: { select: { id: true, name: true } },
    },
  })

  // A student + a real scheduled time both exist — worth an email. (A
  // no-date "open" session, or one starting immediately, isn't.)
  if (session.studentId && session.scheduledAt) {
    await notifySessionScheduled(session.id)
  }

  return NextResponse.json({ session })
})
