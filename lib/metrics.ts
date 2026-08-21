import { prisma } from '@/lib/prisma'
import { createLogger } from '@/lib/logger'

const logger = createLogger('metrics')

export type EventCategory =
  | 'ai'
  | 'transcript'
  | 'session'
  | 'http'
  | 'error'
  | 'lead'
  | 'daily'
  | 'email'
  | 'match'
export type EventLevel = 'info' | 'warn' | 'error'

// Cap on stored request/response previews so a big prompt can't bloat the row.
const PREVIEW_MAX = 2000
function truncate(s: string | undefined): string | undefined {
  if (s == null) return undefined
  return s.length > PREVIEW_MAX ? s.slice(0, PREVIEW_MAX) + `…[+${s.length - PREVIEW_MAX} chars]` : s
}

export interface RecordEventInput {
  category: EventCategory
  name: string
  level?: EventLevel
  durationMs?: number
  success?: boolean
  model?: string
  inputTokens?: number
  outputTokens?: number
  metadata?: Record<string, unknown>
  requestPreview?: string
  responsePreview?: string
}

/**
 * Record a telemetry event for the admin system-health dashboard.
 *
 * Fire-and-forget: this never throws into the caller and never blocks the
 * request path. A failed metric write is logged and swallowed — telemetry
 * must not take down the feature it measures.
 */
export function recordEvent(input: RecordEventInput): void {
  prisma.systemEvent
    .create({
      data: {
        category: input.category,
        name: input.name,
        level: input.level ?? 'info',
        durationMs: input.durationMs,
        success: input.success,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        metadata: input.metadata ? JSON.stringify(input.metadata) : '{}',
        requestPreview: truncate(input.requestPreview),
        responsePreview: truncate(input.responsePreview),
      },
    })
    .catch((err) => {
      // Warn, not error, and no stack: a telemetry write fails almost only when
      // the database is already unreachable, and the request that triggered it
      // has logged that failure with a full stack. Repeating it here doubles
      // every log line during exactly the outage you need to read through.
      logger.warn('Failed to record metric event', {
        name: input.name,
        errorMessage: err instanceof Error ? err.message : String(err),
      })
    })
}

/**
 * Wrap an async call to a dependent service so every invocation is timed and
 * recorded as a SystemEvent (success or failure), without changing behavior —
 * the result passes through and errors still throw. Use this for Daily.co,
 * Resend, and any other external integration.
 */
export async function trackedCall<T>(
  meta: { category: EventCategory; name: string; metadata?: Record<string, unknown> },
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    recordEvent({ category: meta.category, name: meta.name, success: true, durationMs: Date.now() - start, metadata: meta.metadata })
    return result
  } catch (err) {
    recordEvent({
      category: meta.category,
      name: meta.name,
      level: 'error',
      success: false,
      durationMs: Date.now() - start,
      metadata: { ...meta.metadata, error: err instanceof Error ? err.message : String(err) },
    })
    throw err
  }
}

/**
 * Delete SystemEvent rows older than `days`. Returns the count removed. Call
 * from a scheduled job / admin action to keep the table bounded.
 */
export async function pruneOldEvents(days = 90): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 3600_000)
  const res = await prisma.systemEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return res.count
}

// Per-model token pricing in USD per 1M tokens. Used to estimate spend on the
// dashboard. Keep in sync with the models referenced in lib/config.ts.
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-8': { input: 5, output: 25 },
}

/**
 * Estimate USD cost for a number of input/output tokens on a given model.
 * Returns 0 for unknown models (pricing not configured).
 */
export function estimateCost(model: string | null | undefined, inputTokens = 0, outputTokens = 0): number {
  if (!model) return 0
  const rate = PRICING[model]
  if (!rate) return 0
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output
}
