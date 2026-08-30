// Orchestrates finishing an adaptive assessment: synthesize the holistic
// result (AI) and seed StudentProgress/MasteryHistory per sub-topic covered.
// Mirrors the session-processing.ts pattern — this file does I/O; the pure
// ladder math lives in assessment-engine.ts.

import { prisma } from '@/lib/prisma'
import type { Assessment, AssessmentItem, StudentProfile } from '@prisma/client'
import { generateAssessmentSummary, type AssessmentItemRecord } from '@/lib/ai/assessment-summary'
import { resolveOutcome, levelToMastery } from '@/lib/assessment-engine'
import { config } from '@/lib/config'
import { applyMastery } from '@/lib/progress'
import { createLogger } from '@/lib/logger'

const logger = createLogger('assessment-complete')

/**
 * How long a `completing` claim is honored before another attempt may take it
 * over. Mirrors lib/billing-send.ts's PENDING_TAKEOVER_MS: the try/catch in
 * `completeAssessment` unsticks the common case (a thrown error during
 * completion) immediately, but nothing in-process can catch a process that
 * simply stops existing (a deploy, an OOM) mid-completion.
 */
const COMPLETING_TAKEOVER_MS = 5 * 60_000

type LoadedAssessment = Assessment & {
  items: AssessmentItem[]
  tutoringSession: { student: StudentProfile | null }
}

/**
 * Claim the assessment for completion. True if this call won the claim.
 *
 * Two claims are honored: a fresh one from `in_progress` (the normal case —
 * see the race this guards against below), and a takeover of a `completing`
 * claim old enough to be abandoned. A `completingAt` of null means the row
 * predates this field (or a claim that was never stamped) and is likewise
 * safe to take over.
 */
async function claimAssessment(assessmentId: string): Promise<boolean> {
  const now = new Date()

  // This can be entered twice for the same assessment — the tutor clicks "End
  // assessment" the instant the student's last answer lands and triggers the
  // same completion from the other side — and a plain status check isn't
  // enough to stop both from proceeding: both would read 'in_progress', both
  // then run the AI summary call (one clobbering the other's result) and both
  // apply the mastery EMA blend per sub-topic, double-counting the update on
  // top of itself. The conditional updateMany is the arbiter, same pattern as
  // every other action in this app that must resolve exactly once.
  const fresh = await prisma.assessment.updateMany({
    where: { id: assessmentId, status: 'in_progress' },
    data: { status: 'completing', completingAt: now },
  })
  if (fresh.count > 0) return true

  const staleCutoff = new Date(now.getTime() - COMPLETING_TAKEOVER_MS)
  const takeover = await prisma.assessment.updateMany({
    where: {
      id: assessmentId,
      status: 'completing',
      OR: [{ completingAt: { lt: staleCutoff } }, { completingAt: null }],
    },
    data: { completingAt: now },
  })
  return takeover.count > 0
}

/** Roll a held `completing` claim back so the next attempt can retry it right away. */
async function releaseClaim(assessmentId: string): Promise<void> {
  await prisma.assessment
    .updateMany({
      // Conditional on still being 'completing' so this can't clobber a status
      // a concurrent stale-claim takeover already moved past.
      where: { id: assessmentId, status: 'completing' },
      data: { status: 'in_progress', completingAt: null },
    })
    .catch((err) => {
      logger.error('Could not roll back stuck assessment completion claim', err, { assessmentId })
    })
}

function loadAssessment(assessmentId: string): Promise<LoadedAssessment | null> {
  return prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      items: { orderBy: { index: 'asc' } },
      tutoringSession: { include: { student: true } },
    },
  })
}

/** Generate the holistic summary and write the `completed` row. Throws on failure. */
async function finalizeAssessment(assessment: LoadedAssessment): Promise<void> {
  const student = assessment.tutoringSession.student
  const graded = assessment.items.filter((it) => it.answeredAt || it.tutorResult)
  const estimatedLevel = graded.length ? graded[graded.length - 1].level : assessment.currentLevel

  const itemRecords: AssessmentItemRecord[] = assessment.items.map((it) => ({
    index: it.index,
    level: it.level,
    topic: it.topic,
    question: it.question,
    outcome: resolveOutcome(it.autoCorrect, it.tutorResult),
  }))

  let summary = ''
  let strengths: string[] = []
  let gaps: string[] = []
  try {
    const result = await generateAssessmentSummary({
      studentName: student?.name || 'the student',
      studentGrade: student?.gradeLevel || '',
      topic: assessment.topic,
      estimatedLevel,
      items: itemRecords,
    })
    summary = result.summary
    strengths = result.strengths
    gaps = result.gaps
  } catch (err) {
    logger.error('Failed to generate assessment summary; completing without it', err, { assessmentId: assessment.id })
  }

  await prisma.assessment.update({
    where: { id: assessment.id },
    data: {
      status: 'completed',
      completingAt: null,
      completedAt: new Date(),
      estimatedLevel,
      summary,
      strengths: JSON.stringify(strengths),
      gaps: JSON.stringify(gaps),
    },
  })
}

/**
 * Seed mastery per distinct sub-topic covered, averaging the level of items
 * within that sub-topic (a "worked_together" item still contributes its
 * level — it reflects where the student was probed, even if the outcome was
 * ambiguous).
 *
 * Best-effort: called only after the assessment is durably `completed`, so a
 * failure here must not roll that back or retry the whole completion — each
 * sub-topic already logs and continues on its own error.
 */
async function seedMastery(assessment: LoadedAssessment): Promise<void> {
  const student = assessment.tutoringSession.student
  if (!student) return

  const bySubTopic = new Map<string, number[]>()
  for (const it of assessment.items) {
    const key = it.topic || assessment.topic
    if (!bySubTopic.has(key)) bySubTopic.set(key, [])
    bySubTopic.get(key)!.push(it.level)
  }

  for (const [subTopic, levels] of bySubTopic) {
    const avgLevel = levels.reduce((s, l) => s + l, 0) / levels.length
    const observed = levelToMastery(avgLevel)
    try {
      // Same EMA blend used for sessions and practice attempts: a single
      // assessment nudges mastery rather than overwriting prior signal.
      await applyMastery(student.id, subTopic, 'assessment', (current) =>
        current === null
          ? observed
          : config.mastery.alpha * observed + (1 - config.mastery.alpha) * current,
      )
    } catch (err) {
      logger.error(`Failed to seed mastery for sub-topic "${subTopic}"`, err, { assessmentId: assessment.id })
    }
  }
}

export async function completeAssessment(assessmentId: string): Promise<void> {
  const claimed = await claimAssessment(assessmentId)
  if (!claimed) return

  let assessment: LoadedAssessment | null
  try {
    assessment = await loadAssessment(assessmentId)
    if (!assessment) {
      // The row disappeared between the claim and this read (e.g. a cascade
      // delete of its TutoringSession). Nothing left to complete.
      await releaseClaim(assessmentId)
      return
    }
    await finalizeAssessment(assessment)
  } catch (err) {
    // Something failed after this call claimed the assessment but before it
    // reached 'completed' — a DB blip, an unexpected throw. Without rolling
    // the claim back, the row was stuck in 'completing' forever: every
    // answer/end/override request on it 409s as "already ended" (see the
    // status checks in those routes), and the tutor panel shows neither the
    // in-progress UI nor the result (shapeAssessment only populates `result`
    // for status 'completed'). The stale-claim takeover in claimAssessment is
    // the backstop for a crash that skips this catch entirely.
    await releaseClaim(assessmentId)
    throw err
  }

  await seedMastery(assessment)
}
