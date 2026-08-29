import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildOverallTrend } from '@/lib/mastery-trend'
import { route } from '@/lib/api-handler'

/** Newest snapshots kept for the trend chart; see the query below. */
const MASTERY_HISTORY_LIMIT = 1000

export const GET = route('student/progress', async () => {
  const auth = await requireStudent()
  if (!auth.ok) return auth.response

  const [progress, history] = await Promise.all([
    prisma.studentProgress.findMany({
      where: { studentId: auth.student.id },
      orderBy: { mastery: 'desc' },
    }),
    // Bounded on purpose: MasteryHistory grows one row per mastery update and
    // never shrinks, while buildOverallTrend downsamples to ~120 points. The
    // most recent slice is far more than enough to draw a faithful curve, and
    // without a cap this payload grows for the life of the account.
    prisma.masteryHistory.findMany({
      where: { studentId: auth.student.id },
      orderBy: { createdAt: 'desc' },
      select: { topic: true, mastery: true, createdAt: true },
      take: MASTERY_HISTORY_LIMIT,
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
