import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'

export async function GET() {
  try {
    const auth = await requireTutor()
    if (!auth.ok) return auth.response

    const roster = await prisma.tutorStudent.findMany({
      where: { tutorId: auth.tutor.id },
      include: {
        student: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const students = roster.map((r) => ({
      id: r.student.id,
      name: r.student.name,
      email: r.student.user.email,
      gradeLevel: r.student.gradeLevel,
      mathTopics: r.student.mathTopics,
      addedAt: r.createdAt,
    }))

    return NextResponse.json({ students })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireTutor()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`add-student:${auth.payload.userId}`, { maxRequests: 10, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const { email: rawEmail } = await request.json()
    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    const email = rawEmail.toLowerCase().trim()

    const studentUser = await prisma.user.findUnique({
      where: { email },
      include: { studentProfile: true },
    })

    if (!studentUser?.studentProfile) {
      return NextResponse.json({ error: 'No student found with that email' }, { status: 404 })
    }

    const existing = await prisma.tutorStudent.findUnique({
      where: { tutorId_studentId: { tutorId: auth.tutor.id, studentId: studentUser.studentProfile.id } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Student already in your roster' }, { status: 409 })
    }

    await prisma.tutorStudent.create({
      data: { tutorId: auth.tutor.id, studentId: studentUser.studentProfile.id },
    })

    return NextResponse.json({
      student: {
        id: studentUser.studentProfile.id,
        name: studentUser.studentProfile.name,
        email: studentUser.email,
        gradeLevel: studentUser.studentProfile.gradeLevel,
        mathTopics: studentUser.studentProfile.mathTopics,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
