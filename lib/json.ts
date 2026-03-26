/**
 * Safe JSON parse that returns a default value instead of throwing.
 */
export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value)
  } catch {
    console.error('[safeJsonParse] Failed to parse JSON:', value.slice(0, 200))
    return fallback
  }
}
