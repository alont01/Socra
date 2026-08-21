import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildOverallTrend } from '@/lib/mastery-trend'
import { route } from '@/lib/api-handler'

export const GET = route('parent/children/[id]/progress', async (_request: Request, { params }: { params: Promise<{ id: string }> },) => {
  const auth = await requireParent()
  if (!auth.ok) return auth.response
  const { id } = await params

  // Ownership: the child must be linked to this parent.
  const child = await prisma.studentProfile.findFirst({
    where: { id, parentId: auth.parent.id },
    select: { id: true, name: true, gradeLevel: true },
  })
  if (!child) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [progress, history] = await Promise.all([
    prisma.studentProgress.findMany({
      where: { studentId: child.id },
      orderBy: { mastery: 'desc' },
      select: { topic: true, mastery: true, updatedAt: true },
    }),
    prisma.masteryHistory.findMany({
      where: { studentId: child.id },
      orderBy: { createdAt: 'asc' },
      select: { topic: true, mastery: true, createdAt: true },
    }),
  ])

  const trend = buildOverallTrend(
    history.map((h) => ({ topic: h.topic, mastery: h.mastery, createdAt: h.createdAt.toISOString() })),
  )

  return NextResponse.json({ child, progress, trend })
})
