import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildOverallTrend } from '@/lib/mastery-trend'
import { route } from '@/lib/api-handler'

export const GET = route('student/progress', async () => {
  const auth = await requireStudent()
  if (!auth.ok) return auth.response

  const [progress, history] = await Promise.all([
    prisma.studentProgress.findMany({
      where: { studentId: auth.student.id },
      orderBy: { mastery: 'desc' },
    }),
    prisma.masteryHistory.findMany({
      where: { studentId: auth.student.id },
      orderBy: { createdAt: 'asc' },
      select: { topic: true, mastery: true, createdAt: true },
    }),
  ])

  return NextResponse.json({
    progress: progress.map((p) => ({
      topic: p.topic,
      mastery: p.mastery,
      updatedAt: p.updatedAt,
    })),
    trend: buildOverallTrend(
      history.map((h) => ({ topic: h.topic, mastery: h.mastery, createdAt: h.createdAt.toISOString() })),
    ),
  })
})
