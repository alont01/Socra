import { prisma } from '@/lib/prisma'
import { config } from '@/lib/config'

/** Clamp a value to [0, 1] range. */
function clampMastery(value: number): number {
  return Math.min(1.0, Math.max(0.0, value))
}

export async function updateMasteryScore(studentId: string, topic: string, correct: boolean) {
  const { alpha } = config.mastery
  const newValue = correct ? 1.0 : 0.0

  const existing = await prisma.studentProgress.findUnique({
    where: { studentId_topic: { studentId, topic } },
  })

  if (existing) {
    const updated = clampMastery(alpha * newValue + (1 - alpha) * existing.mastery)
    await prisma.studentProgress.update({
      where: { id: existing.id },
      data: { mastery: updated },
    })
  } else {
    await prisma.studentProgress.create({
      data: {
        studentId,
        topic,
        mastery: clampMastery(newValue * alpha),
      },
    })
  }
}
