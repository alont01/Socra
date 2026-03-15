import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const take = Math.min(Number(searchParams.get('limit')) || 50, 100)
    const cursor = searchParams.get('cursor') || undefined

    const paginationArgs = {
      take: take + 1, // fetch one extra to detect next page
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' as const },
    }

    let sessions

    if (payload.role === 'TUTOR') {
      const tutor = await prisma.tutorProfile.findUnique({ where: { userId: payload.userId } })
      if (!tutor) return NextResponse.json({ error: 'Not a tutor' }, { status: 403 })

      sessions = await prisma.tutoringSession.findMany({
        where: { tutorId: tutor.id },
        include: {
          student: { select: { id: true, name: true, gradeLevel: true } },
        },
        ...paginationArgs,
      })
    } else {
      const student = await prisma.studentProfile.findUnique({ where: { userId: payload.userId } })
      if (!student) return NextResponse.json({ error: 'Not a student' }, { status: 403 })

      sessions = await prisma.tutoringSession.findMany({
        where: { studentId: student.id },
        include: {
          tutor: { select: { id: true, name: true } },
        },
        ...paginationArgs,
      })
    }

    const hasMore = sessions.length > take
    if (hasMore) sessions.pop()
    const nextCursor = hasMore ? sessions[sessions.length - 1]?.id : null

    return NextResponse.json({ sessions, nextCursor })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'TUTOR') {
      return NextResponse.json({ error: 'Only tutors can create sessions' }, { status: 403 })
    }

    const tutor = await prisma.tutorProfile.findUnique({ where: { userId: payload.userId } })
    if (!tutor) return NextResponse.json({ error: 'Not a tutor' }, { status: 403 })

    const { createSessionSchema, parseBody } = await import('@/lib/validations')
    const body = await request.json()
    const parsed = parseBody(createSessionSchema, body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { studentId, topic, scheduledAt } = parsed.data

    const session = await prisma.tutoringSession.create({
      data: {
        tutorId: tutor.id,
        studentId: studentId || null,
        topic: topic || '',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      },
      include: {
        student: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ session })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
