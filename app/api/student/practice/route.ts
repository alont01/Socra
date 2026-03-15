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

    const sets = await prisma.practiceSet.findMany({
      where: { studentId: student.id },
      include: {
        _count: { select: { attempts: true } },
        attempts: { select: { problemIndex: true }, distinct: ['problemIndex'] },
        tutoringSession: { select: { topic: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const practiceSets = sets.map((s) => {
      const problems = JSON.parse(s.problems)
      const completedCount = new Set(s.attempts.map((a) => a.problemIndex)).size
      return {
        id: s.id,
        title: s.title,
        topic: s.tutoringSession?.topic || '',
        problemCount: problems.length,
        completedCount,
        createdAt: s.createdAt,
      }
    })

    return NextResponse.json({ practiceSets })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
