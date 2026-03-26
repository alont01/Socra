import Anthropic from '@anthropic-ai/sdk'

/**
 * Singleton Anthropic client shared across all AI operations.
 * Reads ANTHROPIC_API_KEY from environment automatically.
 */
export const anthropic = new Anthropic()
