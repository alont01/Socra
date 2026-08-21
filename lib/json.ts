import { createLogger } from './logger'

const logger = createLogger('json')

/**
 * Safe JSON parse that returns a default value instead of throwing.
 *
 * Used for the JSON-in-a-text-column fields (analysis arrays, event metadata,
 * whiteboard specs). A malformed value degrades to the fallback rather than
 * taking down the page, but it always leaves a log line — silent corruption is
 * how a bad write goes unnoticed for weeks.
 */
export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value)
  } catch (err) {
    logger.warn('Failed to parse stored JSON; using fallback', {
      preview: value.slice(0, 200),
      length: value.length,
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    return fallback
  }
}
