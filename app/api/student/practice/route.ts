import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'
import { route } from '@/lib/api-handler'

export const GET = route('student/practice', async () => {
  const auth = await requireStudent()
  if (!auth.ok) return auth.response

  const sets = await prisma.practiceSet.findMany({
    where: { studentId: auth.student.id, status: 'assigned' },
    include: {
      // Distinct problem indexes only — the raw attempt count would double-count
      // nothing today but says nothing useful either; completion is what the
      // card shows.
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
})
