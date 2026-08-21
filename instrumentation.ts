/**
 * Runs once when the server process starts (Next.js instrumentation hook).
 *
 * Its only job is to name every required secret that is missing, loudly, at
 * deploy time. The alternative is discovering it at first use — which is how
 * STRIPE_WEBHOOK_SECRET went unset while invoices sent perfectly well and
 * silently never moved to paid.
 *
 * Deliberately does NOT crash on a missing secret. A billing or email
 * credential going missing degrades one feature; refusing to boot would take
 * down live tutoring sessions along with it. Loud and serving beats silent and
 * dark.
 */
export async function register() {
  // Only the Node.js server runtime — the edge runtime has no access to these
  // and would log a misleading second copy.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { createLogger } = await import('@/lib/logger')
  const { missingRequiredEnv } = await import('@/lib/integrations')

  const logger = createLogger('startup')
  const missing = missingRequiredEnv()

  logger.info('Server starting', {
    env: process.env.NODE_ENV,
    commit: process.env.RENDER_GIT_COMMIT ?? 'local',
    missingRequiredSecrets: missing.length,
  })

  if (missing.length === 0) return

  // One line per missing secret, so a log search on any single variable name
  // finds it, and each line carries the consequence rather than just the name.
  for (const item of missing) {
    logger.error(`Required secret ${item.envVar} is not set`, undefined, {
      envVar: item.envVar,
      integration: item.label,
      impact: item.impact,
    })
  }

  logger.error('Server booted with missing required secrets — features are degraded', undefined, {
    missing: missing.map((m) => m.envVar),
  })
}
