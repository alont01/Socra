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

    const student = await prisma.studentProfile.findUnique({ where: { userId: payload.userId } })
    if (!student) return NextResponse.json({ error: 'Not a student' }, { status: 403 })

    const progress = await prisma.studentProgress.findMany({
      where: { studentId: student.id },
      orderBy: { mastery: 'desc' },
    })

    return NextResponse.json({
      progress: progress.map((p) => ({
        topic: p.topic,
        mastery: p.mastery,
        updatedAt: p.updatedAt,
      })),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
