import { prisma } from '@/lib/prisma'
import { config } from '@/lib/config'

/** Clamp a value to [0, 1] range. */
function clampMastery(value: number): number {
  return Math.min(1.0, Math.max(0.0, value))
}

export async function updateMasteryScore(studentId: string, topic: string, correct: boolean) {
  const { alpha } = config.mastery
  const newValue = correct ? 1.0 : 0.0

  // Use a transaction to make the read-then-update atomic, preventing
  // concurrent practice submissions from losing mastery updates
  await prisma.$transaction(async (tx) => {
    const existing = await tx.studentProgress.findUnique({
      where: { studentId_topic: { studentId, topic } },
    })

    const nextMastery = existing
      ? clampMastery(alpha * newValue + (1 - alpha) * existing.mastery)
      : clampMastery(newValue * alpha)

    if (existing) {
      await tx.studentProgress.update({ where: { id: existing.id }, data: { mastery: nextMastery } })
    } else {
      await tx.studentProgress.create({ data: { studentId, topic, mastery: nextMastery } })
    }

    // Time-series snapshot for the progress-over-time trend.
    await tx.masteryHistory.create({
      data: { studentId, topic, mastery: nextMastery, source: 'practice' },
    })
  })
}
