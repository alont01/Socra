import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { route } from '@/lib/api-handler'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { runIntegrationMonitor } from '@/lib/integration-monitor'

export const dynamic = 'force-dynamic'

/**
 * Scheduled integration health check.
 *
 * Called hourly with `Authorization: Bearer $CRON_SECRET` (see
 * .github/workflows/check-integrations.yml), and available to a signed-in admin
 * for a manual run. Emails the team only when an integration changes state.
 *
 * Always returns 200 when the check itself ran — a broken *dependency* is a
 * finding to report, not a failure of this endpoint. The workflow decides
 * whether to fail the job based on the body.
 */
export const POST = route('cron/check-integrations', async (request: Request) => {
  if (!isAuthorizedCron(request)) {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
  }

  const { results, overall, transitions, alertSent } = await runIntegrationMonitor()

  return NextResponse.json({
    overall,
    alertSent,
    transitions,
    integrations: results.map((r) => ({
      key: r.key,
      status: r.status,
      detail: r.detail,
      required: r.required,
      durationMs: r.durationMs,
    })),
  })
})
