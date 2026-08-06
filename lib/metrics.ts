import { prisma } from '@/lib/prisma'
import { createLogger } from '@/lib/logger'

const logger = createLogger('metrics')

export type EventCategory = 'ai' | 'transcript' | 'session' | 'http' | 'error' | 'lead'
export type EventLevel = 'info' | 'warn' | 'error'

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
      },
    })
    .catch((err) => {
      logger.error('Failed to record metric event', err, { name: input.name })
    })
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
