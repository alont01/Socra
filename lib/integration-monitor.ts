// Runs the integration probes, persists the result, and emails the team when a
// dependency changes state.
//
// The alert fires on a *transition* only — healthy → broken, or broken →
// healthy. An hourly probe that mailed on every failing run would send two
// dozen identical messages a day and train everyone to ignore the channel, so
// the noisy version is worse than no alerting at all.

import { prisma } from '@/lib/prisma'
import { createLogger } from '@/lib/logger'
import { recordEvent } from '@/lib/metrics'
import { sendEmail, integrationAlertEmailHtml } from '@/lib/email'
import { checkIntegrations, overallStatus, type IntegrationResult } from '@/lib/integrations'

const logger = createLogger('integration-monitor')

const TEAM_EMAIL = process.env.TEAM_EMAIL || 'team@socratutoring.com'

export interface MonitorResult {
  results: IntegrationResult[]
  overall: 'ok' | 'degraded' | 'down'
  /** Integrations whose status changed since the previous run. */
  transitions: Array<{ key: string; from: string | null; to: string }>
  alertSent: boolean
  /**
   * True when the state table was unreachable, so transitions were inferred
   * without history. Alerting degrades to "anything broken alerts", which can
   * repeat — acceptable, because the case that triggers it is the database
   * being down, which is worth repeating.
   */
  stateUnavailable: boolean
}

/**
 * Probe everything, record the outcome, and alert on any change of state.
 *
 * Safe to call on a schedule or by hand; the only side effects are the
 * IntegrationCheck rows, a telemetry event, and at most one email per run.
 */
export async function runIntegrationMonitor(): Promise<MonitorResult> {
  const results = await checkIntegrations()
  const now = new Date()

  // Reading and writing state must never sink the whole check. The database is
  // one of the things being monitored, so an outage here has to still produce a
  // usable report and an alert — not a 500 that says nothing about why.
  let previousByKey = new Map<string, { key: string; status: string; lastOkAt: Date | null }>()
  let stateUnavailable = false
  try {
    const previous = await prisma.integrationCheck.findMany({
      where: { key: { in: results.map((r) => r.key) } },
      select: { key: true, status: true, lastOkAt: true },
    })
    previousByKey = new Map(previous.map((p) => [p.key, p]))
  } catch (err) {
    stateUnavailable = true
    logger.error('Could not read integration state; alerting without history', err)
  }

  const transitions: MonitorResult['transitions'] = []

  for (const result of results) {
    const before = previousByKey.get(result.key)
    if (!before || before.status !== result.status) {
      // A first-ever observation counts as a transition only when it's already
      // broken — otherwise the very first deploy would alert that everything
      // "changed" to healthy.
      if (before || result.status !== 'ok') {
        transitions.push({ key: result.key, from: before?.status ?? null, to: result.status })
      }
    }

    const lastOkAt = result.status === 'ok' ? now : (before?.lastOkAt ?? null)
    try {
      await prisma.integrationCheck.upsert({
        where: { key: result.key },
        create: {
          key: result.key,
          status: result.status,
          detail: result.detail.slice(0, 500),
          checkedAt: now,
          lastOkAt,
        },
        update: {
          status: result.status,
          detail: result.detail.slice(0, 500),
          checkedAt: now,
          lastOkAt,
        },
      })
    } catch {
      // Already logged once above if the store is unreachable; don't repeat it
      // per integration.
      stateUnavailable = true
    }
  }

  const overall = overallStatus(results)

  recordEvent({
    category: 'error',
    name: 'integrations.check',
    level: overall === 'ok' ? 'info' : overall === 'down' ? 'error' : 'warn',
    success: overall === 'ok',
    metadata: {
      overall,
      broken: results.filter((r) => r.status !== 'ok').map((r) => `${r.key}:${r.status}`),
      transitions: transitions.map((t) => `${t.key}:${t.from ?? 'new'}→${t.to}`),
    },
  })

  let alertSent = false
  if (transitions.length > 0) {
    alertSent = await sendTransitionAlert(results, transitions, now, stateUnavailable)
  }

  logger.info('Integration monitor complete', {
    overall,
    checked: results.length,
    transitions: transitions.length,
    alertSent,
    stateUnavailable,
  })

  return { results, overall, transitions, alertSent, stateUnavailable }
}

/**
 * One email covering every integration that changed this run.
 *
 * Note the ordering: `alertedAt` is stamped only after a successful send, so a
 * mail failure leaves the row un-stamped and the next run tries again. And when
 * Resend is itself the broken integration, the send simply fails — the
 * dashboard and the logs remain the signal of last resort.
 */
async function sendTransitionAlert(
  results: IntegrationResult[],
  transitions: MonitorResult['transitions'],
  now: Date,
  stateUnavailable: boolean,
): Promise<boolean> {
  const changed = transitions
    .map((t) => {
      const result = results.find((r) => r.key === t.key)
      return result ? { ...result, from: t.from } : null
    })
    .filter((r): r is IntegrationResult & { from: string | null } => r !== null)

  const recovered = changed.every((c) => c.status === 'ok')
  const subject = recovered
    ? `Socra: integrations recovered (${changed.map((c) => c.label).join(', ')})`
    : `Socra: integration problem — ${changed.filter((c) => c.status !== 'ok').map((c) => c.label).join(', ')}`

  const sent = await sendEmail({
    to: TEAM_EMAIL,
    subject,
    html: integrationAlertEmailHtml(changed, recovered),
  })

  if (sent && !stateUnavailable) {
    await prisma.integrationCheck
      .updateMany({
        where: { key: { in: changed.map((c) => c.key) } },
        data: { alertedAt: now },
      })
      .catch((err) => logger.warn('Could not stamp alertedAt', { error: String(err) }))
  } else if (!sent) {
    logger.error('Could not send integration alert', undefined, {
      subject,
      keys: changed.map((c) => c.key),
    })
  }

  return sent
}
