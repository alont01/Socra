// Orchestrates finishing an adaptive assessment: synthesize the holistic
// result (AI) and seed StudentProgress/MasteryHistory per sub-topic covered.
// Mirrors the session-processing.ts pattern — this file does I/O; the pure
// ladder math lives in assessment-engine.ts.

import { prisma } from '@/lib/prisma'
import { generateAssessmentSummary, type AssessmentItemRecord } from '@/lib/ai/assessment-summary'
import { resolveOutcome, levelToMastery } from '@/lib/assessment-engine'
import { config } from '@/lib/config'
import { applyMastery } from '@/lib/progress'
import { createLogger } from '@/lib/logger'

const logger = createLogger('assessment-complete')

export async function completeAssessment(assessmentId: string): Promise<void> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      items: { orderBy: { index: 'asc' } },
      tutoringSession: { include: { student: true } },
    },
  })
  if (!assessment || assessment.status === 'completed') return

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
    logger.error('Failed to generate assessment summary; completing without it', err, { assessmentId })
  }

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      estimatedLevel,
      summary,
      strengths: JSON.stringify(strengths),
      gaps: JSON.stringify(gaps),
    },
  })

  if (!student) return

  // Seed mastery per distinct sub-topic covered, averaging the level of items
  // within that sub-topic (a "worked_together" item still contributes its
  // level — it reflects where the student was probed, even if the outcome was
  // ambiguous).
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
      logger.error(`Failed to seed mastery for sub-topic "${subTopic}"`, err, { assessmentId })
    }
  }
}
