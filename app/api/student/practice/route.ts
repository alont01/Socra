import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'

export async function GET() {
  try {
    const auth = await requireStudent()
    if (!auth.ok) return auth.response

    const sets = await prisma.practiceSet.findMany({
      where: { studentId: auth.student.id, status: 'assigned' },
      include: {
        _count: { select: { attempts: true } },
        attempts: { select: { problemIndex: true }, distinct: ['problemIndex'] },
        tutoringSession: { select: { topic: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const practiceSets = sets.map((s) => {
      const problems = safeJsonParse<unknown[]>(s.problems, [])
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
