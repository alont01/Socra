import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// List the parent's linked children with a light progress summary.
export async function GET() {
  try {
    const auth = await requireParent()
    if (!auth.ok) return auth.response

    const children = await prisma.studentProfile.findMany({
      where: { parentId: auth.parent.id },
      select: { id: true, name: true, gradeLevel: true, goals: true },
      orderBy: { name: 'asc' },
    })

    const summaries = await Promise.all(
      children.map(async (c) => {
        const [mastery, lastSession] = await Promise.all([
          prisma.studentProgress.aggregate({
            where: { studentId: c.id },
            _avg: { mastery: true },
            _count: { _all: true },
          }),
          prisma.tutoringSession.findFirst({
            where: { studentId: c.id, status: 'completed' },
            orderBy: { endedAt: 'desc' },
            select: { topic: true, endedAt: true },
          }),
        ])
        return {
          ...c,
          avgMastery: mastery._avg.mastery,
          topicsTracked: mastery._count._all,
          lastSession: lastSession ? { topic: lastSession.topic, endedAt: lastSession.endedAt } : null,
        }
      }),
    )

    return NextResponse.json({ children: summaries })
  } catch (err) {
    console.error('[parent children]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
