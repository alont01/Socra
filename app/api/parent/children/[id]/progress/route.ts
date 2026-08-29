import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildOverallTrend } from '@/lib/mastery-trend'
import { route } from '@/lib/api-handler'

/** Newest snapshots kept for the trend chart; see the query below. */
const MASTERY_HISTORY_LIMIT = 1000

export const GET = route('parent/children/[id]/progress', async (_request: Request, { params }: { params: Promise<{ id: string }> },) => {
  const auth = await requireParent()
  if (!auth.ok) return auth.response
  const { id } = await params

  // Ownership: the child must be linked to this parent.
  const record = await prisma.studentProfile.findFirst({
    where: { id, parentId: auth.parent.id },
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      // The sign-in handle the parent gave their child. Surfaced so the child
      // page can show "signs in as …" next to the password reset — a parent
      // who has forgotten the password has usually forgotten this too.
      user: { select: { username: true } },
    },
  })
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const child = {
    id: record.id,
    name: record.name,
    gradeLevel: record.gradeLevel,
    username: record.user.username,
  }

  const [progress, history] = await Promise.all([
    prisma.studentProgress.findMany({
      where: { studentId: child.id },
      orderBy: { mastery: 'desc' },
      select: { topic: true, mastery: true, updatedAt: true },
    }),
    // Bounded on purpose: MasteryHistory grows one row per mastery update and
    // never shrinks, while buildOverallTrend downsamples to ~120 points. The
    // most recent slice is far more than enough to draw a faithful curve, and
    // without a cap this payload grows for the life of the account.
    prisma.masteryHistory.findMany({
      where: { studentId: child.id },
      orderBy: { createdAt: 'desc' },
      select: { topic: true, mastery: true, createdAt: true },
      take: MASTERY_HISTORY_LIMIT,
    }),
  ])

  const trend = buildOverallTrend(
    history.map((h) => ({ topic: h.topic, mastery: h.mastery, createdAt: h.createdAt.toISOString() })),
  )

  return NextResponse.json({ child, progress, trend })
})
