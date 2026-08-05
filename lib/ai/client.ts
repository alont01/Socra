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

export async function trackedMessage(
  operation: string,
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const start = Date.now()
  try {
    const response = await anthropic.messages.create(params)
    recordEvent({
      category: 'ai',
      name: `ai.${operation}`,
      success: true,
      durationMs: Date.now() - start,
      model: params.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
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
      metadata: { error: err instanceof Error ? err.message : String(err) },
    })
    throw err
  }
}
