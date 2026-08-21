import { timingSafeEqual } from 'node:crypto'
import { createLogger } from '@/lib/logger'

const logger = createLogger('cron-auth')

/**
 * Shared-secret auth for endpoints a scheduler calls (no cookie, no user).
 *
 * Render's starter plan has no cron, so these are driven by GitHub Actions
 * hitting the deployed URL. The secret is the only thing standing between a
 * scheduler and a public endpoint that mutates session and billing state.
 */
export function isAuthorizedCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // Fail closed. An unset secret must never mean "allow everyone".
    logger.error('CRON_SECRET is not set — refusing scheduled request', undefined, {})
    return false
  }

  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!provided) return false

  // Constant-time compare so a caller can't discover the secret byte by byte
  // from response timing. Lengths must match first — timingSafeEqual throws
  // on differing lengths, which would itself leak the length.
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
