import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { assessmentOverrideSchema, parseBody } from '@/lib/validations'
import { resolveOutcome, finalCorrectFromOutcome } from '@/lib/assessment-engine'
import { shapeAssessment } from '@/lib/assessment-shape'
import { createLogger } from '@/lib/logger'

const logger = createLogger('assessment-override')

// POST — tutor marks an item's true outcome (correct / incorrect / worked
// together). Always wins over the auto-grade for the holistic result. This is
// recorded after the fact — it does not rewind or regenerate the difficulty
// ladder, which already advanced in real time off the auto-grade.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; assessmentId: string }> },
) {
  try {
    const { id, assessmentId } = await params
    const auth = await requireTutor()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const parsed = parseBody(assessmentOverrideSchema, body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { itemId, tutorResult } = parsed.data

    const session = await prisma.tutoringSession.findUnique({ where: { id }, include: { tutor: true } })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.tutor.userId !== auth.payload.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { items: { orderBy: { index: 'asc' } } },
    })
    if (!assessment || assessment.tutoringSessionId !== id) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }
    const item = assessment.items.find((it) => it.id === itemId)
    if (!item) return NextResponse.json({ error: 'Problem not found' }, { status: 404 })

    const outcome = resolveOutcome(item.autoCorrect, tutorResult)
    const finalCorrect = finalCorrectFromOutcome(outcome)

    await prisma.assessmentItem.update({
      where: { id: item.id },
      data: { tutorResult, finalCorrect },
    })

    const fresh = await prisma.assessment.findUniqueOrThrow({
      where: { id: assessment.id },
      include: { items: { orderBy: { index: 'asc' } } },
    })
    return NextResponse.json({ assessment: shapeAssessment(fresh, true) })
  } catch (err) {
    logger.error('Failed to override assessment item', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
