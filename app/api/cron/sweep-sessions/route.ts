import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { route } from '@/lib/api-handler'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { sweepStaleSessions, retryStuckAnalyses } from '@/lib/session-sweeper'

export const dynamic = 'force-dynamic'

/**
 * Close sessions a tutor never ended, and re-fire the post-session pipeline for
 * a completed session that never got one at all (a process restart mid-
 * pipeline, with nothing else left to re-drive it — see retryStuckAnalyses).
 *
 * Called on a schedule with `Authorization: Bearer $CRON_SECRET` (see
 * .github/workflows/sweep-sessions.yml), and available to a signed-in admin for
 * a manual run. Idempotent — running it twice closes/retries nothing extra.
 */
export const POST = route('cron/sweep-sessions', async (request: Request) => {
  if (!isAuthorizedCron(request)) {
    // Fall back to an admin session so this can be triggered by hand.
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
  }

  const [sweep, analysisRetry] = await Promise.all([sweepStaleSessions(), retryStuckAnalyses()])
  return NextResponse.json({ ...sweep, analysisRetry })
})
