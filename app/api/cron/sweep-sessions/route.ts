import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { route } from '@/lib/api-handler'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { sweepStaleSessions } from '@/lib/session-sweeper'

export const dynamic = 'force-dynamic'

/**
 * Close sessions a tutor never ended.
 *
 * Called on a schedule with `Authorization: Bearer $CRON_SECRET` (see
 * .github/workflows/sweep-sessions.yml), and available to a signed-in admin for
 * a manual run. Idempotent — running it twice closes nothing extra.
 */
export const POST = route('cron/sweep-sessions', async (request: Request) => {
  if (!isAuthorizedCron(request)) {
    // Fall back to an admin session so this can be triggered by hand.
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
  }

  const result = await sweepStaleSessions()
  return NextResponse.json(result)
})
