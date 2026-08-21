// One declarative inventory of every external credential the app depends on,
// plus a cheap live probe for each.
//
// The framing here is deliberate: these keys do not expire. Anthropic, Daily,
// Resend, and Stripe keys have no expiry date, so "is it expired?" is the wrong
// question. What actually breaks in production is narrower and checkable:
//
//   not_configured — the env var was never set on the host
//   unauthorized   — the key is wrong, revoked, or from the wrong mode
//                    (a test key in production authenticates against nothing real)
//   unreachable    — the provider is down or the network is blocked
//   ok             — a real authenticated call succeeded just now
//
// Probes must be cheap, read-only, and safe to run every hour: no writes, no
// spend, nothing a provider would rate-limit us for.

import { getStripe } from '@/lib/stripe'
import { createLogger } from '@/lib/logger'

const logger = createLogger('integrations')

export type IntegrationStatus = 'ok' | 'unauthorized' | 'unreachable' | 'not_configured'

export interface IntegrationResult {
  /** Stable id — used as the alert key, so it must not change casually. */
  key: string
  label: string
  status: IntegrationStatus
  /** Human-readable outcome; never contains any part of a credential. */
  detail: string
  /** What stops working while this is broken. */
  impact: string
  /** False for integrations the app can run without. */
  required: boolean
  durationMs: number
}

interface IntegrationDefinition {
  key: string
  label: string
  envVars: string[]
  impact: string
  required: boolean
  /** Cheap authenticated read. Throws to signal `unreachable`. */
  probe: () => Promise<{ status: IntegrationStatus; detail: string }>
}

/** Bound every probe so one hung provider can't stall the whole check. */
const PROBE_TIMEOUT_MS = 8_000

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Map an HTTP status from a provider onto our vocabulary. 401/403 means the
 * credential itself is bad — the single most useful thing to distinguish, since
 * it is the one an operator can fix immediately.
 */
function classify(response: Response, okDetail: string): { status: IntegrationStatus; detail: string } {
  if (response.ok) return { status: 'ok', detail: okDetail }
  if (response.status === 401 || response.status === 403) {
    return { status: 'unauthorized', detail: `Rejected the credential (HTTP ${response.status})` }
  }
  return { status: 'unreachable', detail: `Unexpected response (HTTP ${response.status})` }
}

const DEFINITIONS: IntegrationDefinition[] = [
  {
    key: 'anthropic',
    label: 'Anthropic (Claude)',
    envVars: ['ANTHROPIC_API_KEY'],
    impact: 'Session analysis, practice generation, assessments, and the student chat all stop.',
    required: true,
    probe: async () => {
      // Listing models is the cheapest authenticated read: no tokens, no spend.
      const res = await fetchWithTimeout('https://api.anthropic.com/v1/models?limit=1', {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
          'anthropic-version': '2023-06-01',
        },
      })
      return classify(res, 'Key accepted')
    },
  },
  {
    key: 'daily',
    label: 'Daily.co (video)',
    envVars: ['DAILY_API_KEY'],
    impact: 'Live sessions cannot start — no rooms, no tokens, no transcripts.',
    required: true,
    probe: async () => {
      const res = await fetchWithTimeout('https://api.daily.co/v1/rooms?limit=1', {
        headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY ?? ''}` },
      })
      return classify(res, 'Key accepted')
    },
  },
  {
    key: 'resend',
    label: 'Resend (email)',
    envVars: ['RESEND_API_KEY'],
    impact: 'No verification codes, password resets, match notifications, or invoices reach anyone.',
    required: true,
    probe: async () => {
      const res = await fetchWithTimeout('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ''}` },
      })
      if (res.status === 401) {
        // A key scoped to "Sending access" only — Resend's least-privilege
        // option — correctly 401s on /domains; that is the *desired*
        // configuration, not a broken credential. Confirmed live: a key
        // returning this exact error still sent real mail successfully.
        // Only body inspection can tell the two apart, since both are a 401.
        const body = await res.clone().json().catch(() => null) as { name?: string } | null
        if (body?.name === 'restricted_api_key') {
          return { status: 'ok', detail: 'Send-only key (expected) — domain scope not requested' }
        }
      }
      return classify(res, 'Key accepted')
    },
  },
  {
    key: 'stripe',
    label: 'Stripe (billing)',
    envVars: ['STRIPE_SECRET_KEY'],
    impact: 'Invoices cannot be sent. Hours are still tracked.',
    required: false,
    probe: async () => {
      const stripe = getStripe()
      if (!stripe) return { status: 'not_configured', detail: 'STRIPE_SECRET_KEY is not set' }
      // Retrieving the balance touches no customer data and creates nothing.
      const balance = await stripe.balance.retrieve()
      // Catching a live key in a non-production deploy (or vice versa) is worth
      // more than the check costs — charging real cards from staging is the
      // expensive mistake here.
      const mode = balance.livemode ? 'live' : 'test'
      const expectedLive = process.env.NODE_ENV === 'production'
      if (balance.livemode !== expectedLive) {
        return {
          status: 'unauthorized',
          detail: `Key is in ${mode} mode, but this environment expects ${expectedLive ? 'live' : 'test'} mode`,
        }
      }
      return { status: 'ok', detail: `Key accepted (${mode} mode)` }
    },
  },
  {
    key: 'stripe_webhook',
    label: 'Stripe webhook secret',
    envVars: ['STRIPE_WEBHOOK_SECRET'],
    impact: 'Invoices send but never move to paid — payment tracking silently stops.',
    required: false,
    // Presence-only: a signing secret can't be verified without a real signed
    // payload from Stripe. Its absence is the failure worth catching, and that
    // is exactly the bug this app already shipped once.
    probe: async () => ({ status: 'ok', detail: 'Configured (verified on first webhook delivery)' }),
  },
  {
    key: 'database',
    label: 'PostgreSQL',
    envVars: ['DATABASE_URL'],
    impact: 'Everything stops.',
    required: true,
    probe: async () => {
      const { prisma } = await import('@/lib/prisma')
      await prisma.$queryRaw`SELECT 1`
      return { status: 'ok', detail: 'Query succeeded' }
    },
  },
  {
    key: 'cron_secret',
    label: 'Scheduled-job secret',
    envVars: ['CRON_SECRET'],
    impact: 'The stale-session sweeper is rejected, so abandoned sessions are never closed or billed.',
    required: false,
    probe: async () => ({ status: 'ok', detail: 'Configured' }),
  },
  {
    key: 'auth_secrets',
    label: 'Signing secrets',
    envVars: ['JWT_SECRET', 'AUTH_SECRET'],
    impact: 'JWT_SECRET signs every session cookie; AUTH_SECRET also encrypts live-practice answer tokens.',
    required: true,
    probe: async () => ({ status: 'ok', detail: 'Configured' }),
  },
]

/** Env vars that must be present in production, with what each one is for. */
export function missingRequiredEnv(): Array<{ key: string; label: string; envVar: string; impact: string }> {
  const missing: Array<{ key: string; label: string; envVar: string; impact: string }> = []
  for (const def of DEFINITIONS) {
    if (!def.required) continue
    for (const envVar of def.envVars) {
      if (!(process.env[envVar] ?? '').trim()) {
        missing.push({ key: def.key, label: def.label, envVar, impact: def.impact })
      }
    }
  }
  return missing
}

async function runOne(def: IntegrationDefinition): Promise<IntegrationResult> {
  const startedAt = Date.now()
  const base = { key: def.key, label: def.label, impact: def.impact, required: def.required }

  const unset = def.envVars.filter((v) => !(process.env[v] ?? '').trim())
  if (unset.length > 0) {
    return {
      ...base,
      status: 'not_configured',
      detail: `${unset.join(', ')} not set`,
      durationMs: Date.now() - startedAt,
    }
  }

  try {
    const { status, detail } = await def.probe()
    return { ...base, status, detail, durationMs: Date.now() - startedAt }
  } catch (err) {
    // A thrown probe is a reachability problem, not a credential problem — an
    // SDK error, a DNS failure, or our own 8s timeout.
    const message = err instanceof Error ? err.message : String(err)
    // Stripe (and some SDKs) surface auth failures as thrown errors rather than
    // a non-OK response, so recover that distinction where we can.
    const looksUnauthorized = /\b(401|403|invalid api key|unauthorized|authentication)\b/i.test(message)
    return {
      ...base,
      status: looksUnauthorized ? 'unauthorized' : 'unreachable',
      detail: message.slice(0, 200),
      durationMs: Date.now() - startedAt,
    }
  }
}

/**
 * Probe every integration in parallel.
 *
 * Never throws: a probe that blows up becomes an `unreachable` result, because
 * a health check that can itself fail closed is worse than no health check.
 */
export async function checkIntegrations(): Promise<IntegrationResult[]> {
  const results = await Promise.all(DEFINITIONS.map(runOne))

  const broken = results.filter((r) => r.status !== 'ok')
  if (broken.length > 0) {
    logger.warn('Integration check found problems', {
      broken: broken.map((r) => `${r.key}:${r.status}`),
      total: results.length,
    })
  }

  return results
}

/** Worst status present, for a single at-a-glance verdict. */
export function overallStatus(results: IntegrationResult[]): 'ok' | 'degraded' | 'down' {
  const relevant = results.filter((r) => r.status !== 'ok')
  if (relevant.length === 0) return 'ok'
  return relevant.some((r) => r.required) ? 'down' : 'degraded'
}
