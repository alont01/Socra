import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { completeAssessment } from '@/lib/assessment-complete'
import { shapeAssessment } from '@/lib/assessment-shape'
import { route } from '@/lib/api-handler'


// POST — tutor manually ends the assessment early (before max items /
// convergence). Runs the same holistic-completion flow as a natural stop.
export const POST = route('tutoring-sessions/[id]/assessment/[assessmentId]/end', async (request: Request, { params }: { params: Promise<{ id: string; assessmentId: string }> }) => {
  const { id, assessmentId } = await params
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const session = await prisma.tutoringSession.findUnique({ where: { id }, include: { tutor: true } })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.tutor.userId !== auth.payload.userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } })
  if (!assessment || assessment.tutoringSessionId !== id) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }
  if (assessment.status !== 'in_progress') {
    return NextResponse.json({ error: 'This assessment has already ended' }, { status: 409 })
  }
  if (assessment.itemCount < 1) {
    return NextResponse.json({ error: 'No problems have been generated yet' }, { status: 400 })
  }

  await completeAssessment(assessment.id)

  const fresh = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessment.id },
    include: { items: { orderBy: { index: 'asc' } } },
  })
  return NextResponse.json({ assessment: shapeAssessment(fresh, true) })
})
