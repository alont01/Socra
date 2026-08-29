import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { config } from '@/lib/config'
import { createLogger } from '@/lib/logger'

const logger = createLogger('progress')

/** Clamp a value to [0, 1] range. */
function clampMastery(value: number): number {
  return Math.min(1.0, Math.max(0.0, value))
}

export type MasterySource = 'practice' | 'session' | 'assessment'

/** Postgres raises a serialization failure under Serializable; Prisma maps it here. */
const WRITE_CONFLICT = 'P2034'
const MAX_ATTEMPTS = 5

/**
 * Read-modify-write a topic's mastery, atomically.
 *
 * Every mastery update is `next = f(current)`, which is only safe if no other
 * writer can read the same `current` in between. A plain `$transaction` does
 * NOT give that: Postgres defaults to READ COMMITTED, so two concurrent updates
 * both read the old value, both compute from it, and the second write silently
 * discards the first. That is a lost update, not a race that "usually works" —
 * and it is reachable in normal use, because a student answering live practice,
 * a tutor overriding a result, and the end-of-session pipeline can all touch
 * the same topic at once.
 *
 * Serializable makes the conflict an error instead of a silent loss, and the
 * retry turns that error back into the correct answer. `compute` may run more
 * than once, so it must stay a pure function of `current`.
 */
export async function applyMastery(
  studentId: string,
  topic: string,
  source: MasterySource,
  compute: (current: number | null) => number,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const existing = await tx.studentProgress.findUnique({
            where: { studentId_topic: { studentId, topic } },
          })
          const nextMastery = clampMastery(compute(existing ? existing.mastery : null))

          if (existing) {
            await tx.studentProgress.update({ where: { id: existing.id }, data: { mastery: nextMastery } })
          } else {
            await tx.studentProgress.create({ data: { studentId, topic, mastery: nextMastery } })
          }

          // Time-series snapshot for the progress-over-time trend.
          await tx.masteryHistory.create({
            data: { studentId, topic, mastery: nextMastery, source },
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      return
    } catch (err) {
      const conflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === WRITE_CONFLICT
      if (!conflict || attempt === MAX_ATTEMPTS) {
        if (conflict) {
          logger.error('Gave up on mastery update after repeated write conflicts', err, {
            studentId, topic, source, attempts: attempt,
          })
        }
        throw err
      }
      // Back off a little so two writers don't march in lockstep into the
      // same conflict on every retry.
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt + Math.random() * 15))
    }
  }
}

/** A practice or live-practice answer: exponential moving average toward 1 or 0. */
export async function updateMasteryScore(studentId: string, topic: string, correct: boolean) {
  const { alpha } = config.mastery
  const observed = correct ? 1.0 : 0.0
  await applyMastery(studentId, topic, 'practice', (current) =>
    current === null ? observed * alpha : alpha * observed + (1 - alpha) * current,
  )
}
