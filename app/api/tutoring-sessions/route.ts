import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let sessions

    if (payload.role === 'TUTOR') {
      const tutor = await prisma.tutorProfile.findUnique({ where: { userId: payload.userId } })
      if (!tutor) return NextResponse.json({ error: 'Not a tutor' }, { status: 403 })

      sessions = await prisma.tutoringSession.findMany({
        where: { tutorId: tutor.id },
        include: {
          student: { select: { id: true, name: true, gradeLevel: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    } else {
      const student = await prisma.studentProfile.findUnique({ where: { userId: payload.userId } })
      if (!student) return NextResponse.json({ error: 'Not a student' }, { status: 403 })

      sessions = await prisma.tutoringSession.findMany({
        where: { studentId: student.id },
        include: {
          tutor: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    }

    return NextResponse.json({ sessions })
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

    const { studentId, topic, scheduledAt } = await request.json()

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
