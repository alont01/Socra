import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'
import { route } from '@/lib/api-handler'

export const GET = route('parent/children/[id]/sessions', async (_request: Request, { params }: { params: Promise<{ id: string }> },) => {
  const auth = await requireParent()
  if (!auth.ok) return auth.response
  const { id } = await params

  const child = await prisma.studentProfile.findFirst({
    where: { id, parentId: auth.parent.id },
    select: { id: true, name: true },
  })
  if (!child) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [tutorRoster, upcoming, sessions] = await Promise.all([
    // Who's currently assigned — surfaced separately so the page can show a
    // clear "still finding your tutor" state when this is null.
    prisma.tutorStudent.findFirst({
      where: { studentId: child.id, status: 'active' },
      include: { tutor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tutoringSession.findMany({
      where: { studentId: child.id, status: { in: ['scheduled', 'active'] } },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true, topic: true, status: true, scheduledAt: true },
    }),
    prisma.tutoringSession.findMany({
      where: { studentId: child.id, status: 'completed' },
      orderBy: { endedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        topic: true,
        endedAt: true,
        analysis: {
          select: {
            summary: true,
            conceptsCovered: true,
            studentStrengths: true,
            studentGaps: true,
          },
        },
      },
    }),
  ])

  // Sanitize: parents see the summary, concepts, strengths and gaps — but NOT
  // tutorFeedback, which is coaching written for the tutor.
  const items = sessions.map((s) => ({
    id: s.id,
    topic: s.topic,
    endedAt: s.endedAt,
    analysis: s.analysis
      ? {
          summary: s.analysis.summary,
          conceptsCovered: safeJsonParse<string[]>(s.analysis.conceptsCovered, []),
          strengths: safeJsonParse<string[]>(s.analysis.studentStrengths, []),
          gaps: safeJsonParse<string[]>(s.analysis.studentGaps, []),
        }
      : null,
  }))

  return NextResponse.json({
    child,
    tutor: tutorRoster ? { id: tutorRoster.tutor.id, name: tutorRoster.tutor.name } : null,
    upcomingSessions: upcoming,
    sessions: items,
  })
})
