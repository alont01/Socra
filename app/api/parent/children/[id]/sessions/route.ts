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
            status: true,
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
  //
  // A non-'ok' analysis is a placeholder whose summary is an apology addressed
  // to the tutor ("Add tutor notes, then retry"). Sending it here put that text
  // in front of a parent as their child's lesson recap, with no way to act on
  // it. Those sessions report `analysis: null` — the page already renders that
  // as a neutral pending state.
  const items = sessions.map((s) => ({
    id: s.id,
    topic: s.topic,
    endedAt: s.endedAt,
    // 'pending' means the pipeline hasn't finished and one is still coming;
    // 'unavailable' means it finished and produced nothing usable, so waiting
    // won't help. Collapsing both into a null analysis made a permanently
    // failed session read as "Analysis pending." forever.
    recapStatus: !s.analysis ? 'pending' : s.analysis.status === 'ok' ? 'ready' : 'unavailable',
    analysis: s.analysis && s.analysis.status === 'ok'
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
