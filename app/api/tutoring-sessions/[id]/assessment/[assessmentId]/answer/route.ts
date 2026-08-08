import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { assessmentAnswerSchema, parseBody } from '@/lib/validations'
import { answersMatch } from '@/lib/answer-check'
import { generateAssessmentItem } from '@/lib/ai/assessment-generator'
import { nextLevel, shouldStop, resolveOutcome, finalCorrectFromOutcome } from '@/lib/assessment-engine'
import { completeAssessment } from '@/lib/assessment-complete'
import { shapeAssessment } from '@/lib/assessment-shape'
import { createLogger } from '@/lib/logger'

const logger = createLogger('assessment-answer')

// POST — student submits an answer for the current (unanswered) item. Grades
// it, advances the difficulty ladder, and either generates the next item or
// completes the assessment (max items reached, or the level has converged).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; assessmentId: string }> },
) {
  try {
    const { id, assessmentId } = await params
    const auth = await requireStudent()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`assessment-answer:${auth.payload.userId}`, { maxRequests: 30, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const body = await request.json().catch(() => ({}))
    const parsed = parseBody(assessmentAnswerSchema, body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { itemId, answer } = parsed.data

    const session = await prisma.tutoringSession.findUnique({ where: { id }, include: { student: true } })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (!session.student || session.student.userId !== auth.payload.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { items: { orderBy: { index: 'asc' } } },
    })
    if (!assessment || assessment.tutoringSessionId !== id) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }
    if (assessment.status !== 'in_progress') {
      return NextResponse.json({ error: 'This assessment has already ended' }, { status: 409 })
    }

    const item = assessment.items.find((it) => it.id === itemId)
    if (!item) return NextResponse.json({ error: 'Problem not found' }, { status: 404 })
    if (item.answeredAt) return NextResponse.json({ error: 'This problem has already been answered' }, { status: 409 })
    const current = assessment.items.find((it) => !it.answeredAt)
    if (!current || current.id !== itemId) {
      return NextResponse.json({ error: 'This is not the current problem' }, { status: 409 })
    }

    const autoCorrect = answersMatch(answer, item.answer)
    // Respect a tutor override even if it was set before the student answered
    // (e.g. the tutor jumped ahead) — it should still win over the auto-grade.
    const outcome = resolveOutcome(autoCorrect, item.tutorResult)
    const finalCorrect = finalCorrectFromOutcome(outcome)

    // Atomic conditional update: only grade if still unanswered. Guards
    // against a double-submit (double-click, retry) racing past the checks
    // above and both proceeding to grade + advance the ladder.
    const claim = await prisma.assessmentItem.updateMany({
      where: { id: item.id, answeredAt: null },
      data: { studentAnswer: answer, autoCorrect, finalCorrect, answeredAt: new Date() },
    })
    if (claim.count === 0) {
      return NextResponse.json({ error: 'This problem has already been answered' }, { status: 409 })
    }

    const levelHistory = [...assessment.items.map((it) => it.level)] // includes this item's level already
    const lvl = nextLevel(item.level, outcome!)
    const stop = shouldStop(levelHistory, assessment.itemCount)

    if (stop) {
      await prisma.assessment.update({ where: { id: assessment.id }, data: { currentLevel: lvl } })
      await completeAssessment(assessment.id)
    } else {
      const priorSubTopics = assessment.items.map((it) => it.topic)
      try {
        const nextItem = await generateAssessmentItem({
          topic: assessment.topic,
          studentGrade: session.student.gradeLevel,
          studentName: session.student.name,
          level: lvl,
          priorSubTopics,
        })
        await prisma.assessment.update({
          where: { id: assessment.id },
          data: {
            currentLevel: lvl,
            itemCount: assessment.itemCount + 1,
            items: {
              create: [{
                index: assessment.itemCount + 1,
                level: lvl,
                topic: nextItem.topic,
                question: nextItem.question,
                hint: nextItem.hint,
                answer: nextItem.answer,
              }],
            },
          },
        })
      } catch (err) {
        // Generation failed — end the assessment gracefully rather than strand
        // the student with no next problem and no result.
        logger.error('Next-item generation failed; completing assessment early', err, { assessmentId })
        await completeAssessment(assessment.id)
      }
    }

    const fresh = await prisma.assessment.findUniqueOrThrow({
      where: { id: assessment.id },
      include: { items: { orderBy: { index: 'asc' } } },
    })

    return NextResponse.json({
      assessment: shapeAssessment(fresh, false),
      justAnswered: { correct: autoCorrect, ...(autoCorrect ? {} : { correctAnswer: item.answer }) },
    })
  } catch (err) {
    logger.error('Failed to submit assessment answer', err)
    return NextResponse.json({ error: 'Something went wrong grading that answer. Please try again.' }, { status: 500 })
  }
}
