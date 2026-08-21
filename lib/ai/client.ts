import Anthropic from '@anthropic-ai/sdk'
import { recordEvent } from '@/lib/metrics'

/**
 * Singleton Anthropic client shared across all AI operations.
 * Reads ANTHROPIC_API_KEY from environment automatically.
 */
export const anthropic = new Anthropic()

/**
 * Wrapper around `anthropic.messages.create` that records a telemetry event
 * (latency, token usage, success/failure) for the admin dashboard. Use this
 * for all non-streaming AI calls so they show up in system-health metrics.
 *
 * `operation` is a short label (e.g. "analysis", "practice_set") recorded as
 * the event name `ai.<operation>`.
 */
/**
 * Safely pull the text out of a model response.
 *
 * The naive `response.content[0].text` pattern throws when the content array
 * is empty and silently returns nothing if the first block isn't text (e.g. a
 * leading tool-use or thinking block). This finds the first text block and
 * returns '' when there is none, so callers degrade to their parse-failure
 * path instead of crashing the pipeline.
 */
export function firstText(response: Anthropic.Message): string {
  const block = response.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}

/**
 * Anthropic reports remaining quota on the response headers of every call.
 *
 * There is no endpoint to poll for remaining quota, so these headers are the
 * only way to see how close we are to a ceiling — which makes capturing them on
 * calls we're already making the whole quota-monitoring story. Recorded into
 * the SystemEvent metadata so the admin dashboard can chart headroom and catch
 * a squeeze before it turns into 429s in the middle of a lesson.
 */
function rateLimitFields(headers: Headers): Record<string, unknown> {
  const num = (name: string) => {
    const raw = headers.get(name)
    if (raw === null) return undefined
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const fields: Record<string, unknown> = {
    requestsRemaining: num('anthropic-ratelimit-requests-remaining'),
    requestsLimit: num('anthropic-ratelimit-requests-limit'),
    inputTokensRemaining: num('anthropic-ratelimit-input-tokens-remaining'),
    outputTokensRemaining: num('anthropic-ratelimit-output-tokens-remaining'),
    tokensRemaining: num('anthropic-ratelimit-tokens-remaining'),
    resetsAt: headers.get('anthropic-ratelimit-requests-reset') ?? undefined,
    retryAfter: num('retry-after'),
  }
  // Drop absent headers rather than storing a wall of nulls in every event row.
  for (const key of Object.keys(fields)) {
    if (fields[key] === undefined) delete fields[key]
  }
  return fields
}

export async function trackedMessage(
  operation: string,
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const start = Date.now()
  const requestPreview = promptText(params)
  try {
    // `.withResponse()` hands back the raw HTTP response alongside the parsed
    // body — the only way to read the rate-limit headers.
    const { data: response, response: raw } = await anthropic.messages
      .create(params)
      .withResponse()
    recordEvent({
      category: 'ai',
      name: `ai.${operation}`,
      success: true,
      durationMs: Date.now() - start,
      model: params.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      metadata: rateLimitFields(raw.headers),
      requestPreview,
      responsePreview: firstText(response),
    })
    return response
  } catch (err) {
    recordEvent({
      category: 'ai',
      name: `ai.${operation}`,
      level: 'error',
      success: false,
      durationMs: Date.now() - start,
      model: params.model,
      metadata: {
        error: err instanceof Error ? err.message : String(err),
        // A 429 carries the headers that say when we may retry — the single
        // most useful thing to have recorded when diagnosing a rate-limit event
        // after the fact.
        status: (err as { status?: number } | null)?.status,
        ...((err as { headers?: Headers } | null)?.headers instanceof Headers
          ? rateLimitFields((err as { headers: Headers }).headers)
          : {}),
      },
      requestPreview,
    })
    throw err
  }
}

// Flatten the text of a request's messages for a debuggable preview (images and
// other non-text blocks are noted, not dumped).
function promptText(params: Anthropic.Messages.MessageCreateParamsNonStreaming): string {
  return params.messages
    .map((m) => {
      const c = m.content
      if (typeof c === 'string') return `[${m.role}] ${c}`
      const parts = c.map((b) => (b.type === 'text' ? b.text : `[${b.type}]`))
      return `[${m.role}] ${parts.join(' ')}`
    })
    .join('\n')
}
