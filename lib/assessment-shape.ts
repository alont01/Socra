// Shapes Assessment/AssessmentItem DB rows into API-safe JSON, consistently
// across the start/get/answer/override routes. The correct answer is only
// ever included in the tutor's view (they're live with the student and may
// use it to help) — never sent to the student client.

import type { Assessment, AssessmentItem } from '@prisma/client'
import { safeJsonParse } from '@/lib/json'
import { resolveOutcome } from '@/lib/assessment-engine'
import { config } from '@/lib/config'

export function shapeItem(item: AssessmentItem, forTutor: boolean) {
  return {
    id: item.id,
    index: item.index,
    level: item.level,
    topic: item.topic,
    question: item.question,
    hint: item.hint,
    ...(forTutor ? { answer: item.answer } : {}),
    studentAnswer: item.studentAnswer,
    autoCorrect: item.autoCorrect,
    tutorResult: item.tutorResult,
    outcome: resolveOutcome(item.autoCorrect, item.tutorResult),
    answered: !!item.answeredAt,
  }
}

export function shapeAssessment(
  assessment: Assessment & { items: AssessmentItem[] },
  forTutor: boolean,
) {
  const items = assessment.items.map((it) => shapeItem(it, forTutor))
  const current = assessment.items.find((it) => !it.answeredAt)
  return {
    id: assessment.id,
    topic: assessment.topic,
    status: assessment.status,
    currentLevel: assessment.currentLevel,
    itemCount: assessment.itemCount,
    maxItems: config.assessment.maxItems,
    items,
    currentItem: current ? shapeItem(current, forTutor) : null,
    // Holistic result, present once completed.
    result:
      assessment.status === 'completed'
        ? {
            estimatedLevel: assessment.estimatedLevel,
            summary: assessment.summary,
            strengths: safeJsonParse<string[]>(assessment.strengths, []),
            gaps: safeJsonParse<string[]>(assessment.gaps, []),
          }
        : null,
  }
}
