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

    const tutor = await prisma.tutorProfile.findUnique({
      where: { userId: payload.userId },
    })
    if (!tutor) return NextResponse.json({ error: 'Not a tutor' }, { status: 403 })

    const roster = await prisma.tutorStudent.findMany({
      where: { tutorId: tutor.id },
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
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tutor = await prisma.tutorProfile.findUnique({
      where: { userId: payload.userId },
    })
    if (!tutor) return NextResponse.json({ error: 'Not a tutor' }, { status: 403 })

    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    const studentUser = await prisma.user.findUnique({
      where: { email },
      include: { studentProfile: true },
    })

    if (!studentUser?.studentProfile) {
      return NextResponse.json({ error: 'No student found with that email' }, { status: 404 })
    }

    const existing = await prisma.tutorStudent.findUnique({
      where: { tutorId_studentId: { tutorId: tutor.id, studentId: studentUser.studentProfile.id } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Student already in your roster' }, { status: 409 })
    }

    await prisma.tutorStudent.create({
      data: { tutorId: tutor.id, studentId: studentUser.studentProfile.id },
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
