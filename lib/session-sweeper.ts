// Closes sessions the tutor never ended.
//
// `endedAt` is written only when a tutor clicks End. A session they walk away
// from stays `active` forever, which is wrong in both directions: it never
// reaches the post-session pipeline, and it is never billed at all — the
// mirror image of the overrun problem.
//
// The sweeper ends those at their capped duration, so the family is charged
// what was booked and nothing more, and flags them for admin review.

import { prisma } from '@/lib/prisma'
import { config } from '@/lib/config'
import { createLogger } from '@/lib/logger'
import { recordEvent } from '@/lib/metrics'
import { processSessionPostCompletion } from '@/lib/session-processing'
import { resolveScheduledMinutes } from '@/lib/billing'

const logger = createLogger('session-sweeper')

export interface SweepResult {
  scanned: number
  closed: string[]
  failed: Array<{ sessionId: string; error: string }>
  /** True when more stale sessions remain for the next run. */
  more: boolean
}

/**
 * Most sessions one run will close.
 *
 * Each closure kicks off the post-session pipeline (Daily transcript polling
 * plus several model calls). Draining a large backlog — the first run after
 * deploying this, say — would fire all of them at once and hit provider rate
 * limits. The sweeper runs hourly, so a backlog drains over a few runs.
 */
const MAX_PER_RUN = 25

/**
 * End every `active` session that started longer than `staleAfterHours` ago.
 *
 * `endedAt` is set to the billing cap (scheduled + grace) rather than "now", so
 * how late the sweeper happens to run never changes what a family pays.
 * Idempotent: the conditional update means a session already closed by the
 * tutor or a concurrent sweep is skipped, not double-processed.
 */
export async function sweepStaleSessions(now: Date = new Date()): Promise<SweepResult> {
  const cutoff = new Date(now.getTime() - config.session.staleAfterHours * 3_600_000)

  const stale = await prisma.tutoringSession.findMany({
    where: { status: 'active', startedAt: { not: null, lt: cutoff } },
    select: { id: true, startedAt: true, scheduledMinutes: true, tutorId: true, studentId: true },
    orderBy: { startedAt: 'asc' }, // oldest first, so a backlog drains in order
    take: MAX_PER_RUN + 1, // one extra to detect that more remain
  })

  const batch = stale.slice(0, MAX_PER_RUN)
  const result: SweepResult = { scanned: batch.length, closed: [], failed: [], more: stale.length > MAX_PER_RUN }
  if (batch.length === 0) return result

  for (const session of batch) {
    try {
      const startedAt = session.startedAt!
      // Same fallback billableHours() uses for a missing/nonsensical scheduled
      // length — otherwise a bad row here bakes an unbounded `endedAt` into a
      // row billing then caps correctly, and the two permanently disagree.
      const cappedMinutes = resolveScheduledMinutes(session.scheduledMinutes) + config.billing.graceMinutes
      const endedAt = new Date(startedAt.getTime() + cappedMinutes * 60_000)

      // Conditional: only close it if it's still active. A tutor ending the
      // session between the scan above and this write must win.
      const updated = await prisma.tutoringSession.updateMany({
        where: { id: session.id, status: 'active' },
        data: { status: 'completed', endedAt, autoClosed: true },
      })
      if (updated.count === 0) continue

      result.closed.push(session.id)
      logger.warn('Auto-closed abandoned session', {
        sessionId: session.id,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        billedMinutes: cappedMinutes,
      })

      // Run the normal post-session pipeline so an abandoned session still gets
      // its transcript and analysis. Best-effort — a failure here must not stop
      // the sweep, and the session is already correctly closed for billing.
      processSessionPostCompletion(session.id).catch((err) =>
        logger.error('Post-processing failed for auto-closed session', err, { sessionId: session.id }),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('Could not auto-close session', err, { sessionId: session.id })
      result.failed.push({ sessionId: session.id, error: message })
    }
  }

  recordEvent({
    category: 'session',
    name: 'session.sweep',
    success: result.failed.length === 0,
    level: result.failed.length > 0 ? 'error' : result.closed.length > 0 ? 'warn' : 'info',
    metadata: { scanned: result.scanned, closed: result.closed.length, failed: result.failed.length, more: result.more },
  })

  return result
}

export interface AnalysisRetrySweepResult {
  scanned: number
  retried: string[]
  /** True when more stuck sessions remain for the next run. */
  more: boolean
}

/**
 * Re-fire the post-session pipeline for a `completed` session that never got
 * one at all — no SessionAnalysis row, placeholder or otherwise.
 *
 * `processSessionPostCompletion` is started fire-and-forget from POST /end (and
 * from the sweeper above); a process restart or crash mid-pipeline drops it on
 * the floor with nothing written, and nothing else ever re-drives it — no
 * `active` row for sweepStaleSessions to find, no placeholder analysis for the
 * tutor's "Retry analysis" button to act on. The tutor and parent are left on
 * "still being written" / "processing" forever with no way to know a retry is
 * even possible.
 *
 * Idempotent for the same reason retry-analysis's manual path is: the pipeline
 * itself checks for an existing analysis before doing any work, so re-running
 * it against a session another invocation is mid-way through (or one that
 * finished between the scan and this call) is a safe no-op, not a double-run.
 */
export async function retryStuckAnalyses(now: Date = new Date()): Promise<AnalysisRetrySweepResult> {
  const cutoff = new Date(now.getTime() - config.session.staleAnalysisAfterMinutes * 60_000)

  const stuck = await prisma.tutoringSession.findMany({
    where: {
      status: 'completed',
      studentId: { not: null }, // an open session with no student never gets analyzed — see session-processing.ts
      endedAt: { not: null, lt: cutoff },
      analysis: null,
    },
    select: { id: true },
    orderBy: { endedAt: 'asc' },
    take: MAX_PER_RUN + 1,
  })

  const batch = stuck.slice(0, MAX_PER_RUN)
  const result: AnalysisRetrySweepResult = { scanned: batch.length, retried: [], more: stuck.length > MAX_PER_RUN }

  for (const session of batch) {
    logger.warn('Re-triggering post-session pipeline for a session with no analysis at all', { sessionId: session.id })
    result.retried.push(session.id)
    // Fire-and-forget, same as the sweeper above — one stuck pipeline failing
    // again must not stop the rest, and a session left over is picked up on
    // the next run either way.
    processSessionPostCompletion(session.id).catch((err) =>
      logger.error('Retrying a stuck analysis failed', err, { sessionId: session.id }),
    )
  }

  if (result.retried.length > 0) {
    recordEvent({
      category: 'session',
      name: 'session.analysis_retry_sweep',
      success: true,
      level: 'warn',
      metadata: { scanned: result.scanned, retried: result.retried.length, more: result.more },
    })
  }

  return result
}
