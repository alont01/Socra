import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { route } from '@/lib/api-handler'
import { checkIntegrations, overallStatus } from '@/lib/integrations'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Live health of every external dependency, for the admin dashboard.
 *
 * Probes on demand rather than reading the last cron result, so a fix can be
 * verified immediately instead of waiting up to an hour for the next scheduled
 * run. The stored rows are joined in only to answer "how long has this been
 * broken?", which a fresh probe cannot know.
 */
export const GET = route('admin/integrations', async () => {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const results = await checkIntegrations()

  // Best-effort: the live probe results are the point. If the state table is
  // unreachable we lose "down for 3h", not the page — and the database probe
  // itself will already be reporting the outage.
  const history = await prisma.integrationCheck
    .findMany({
      where: { key: { in: results.map((r) => r.key) } },
      select: { key: true, lastOkAt: true, checkedAt: true },
    })
    .catch(() => [] as Array<{ key: string; lastOkAt: Date | null; checkedAt: Date }>)
  const historyByKey = new Map(history.map((h) => [h.key, h]))

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    overall: overallStatus(results),
    integrations: results.map((r) => ({
      ...r,
      lastOkAt: historyByKey.get(r.key)?.lastOkAt ?? null,
      lastCheckedAt: historyByKey.get(r.key)?.checkedAt ?? null,
    })),
  })
})
