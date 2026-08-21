import { NextResponse } from 'next/server'
import { z } from 'zod'
import { route } from '@/lib/api-handler'
import { requireAuth } from '@/lib/api-auth'
import { createLogger } from '@/lib/logger'
import { recordEvent } from '@/lib/metrics'
import { rateLimit } from '@/lib/rate-limit'
import { parseBody } from '@/lib/validations'

const logger = createLogger('client-errors')

// Sizes are capped here rather than trusted from the client: this is a
// browser-writable sink, so every field is bounded before it reaches the DB.
const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().max(4000).optional(),
  componentStack: z.string().max(4000).optional(),
  /** Where it happened — pathname only, never a full URL with query params. */
  path: z.string().max(300).optional(),
  /** Which boundary caught it, e.g. "app-error" or "error-boundary". */
  source: z.string().max(60).optional(),
})

/**
 * Sink for errors caught by the client error boundaries.
 *
 * Without this, a crash in the browser lands in the user's devtools console
 * and nowhere else — the server looks perfectly healthy while the page is
 * blank. Authenticated so it can't be used as an anonymous log-spam target,
 * and rate limited per user.
 */
export const POST = route('client-errors', async (request: Request) => {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const rl = rateLimit(`client-error:${auth.payload.userId}`, { maxRequests: 10, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const parsed = parseBody(clientErrorSchema, await request.json())
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { message, stack, componentStack, path, source } = parsed.data

  logger.error('Client-side error', undefined, { clientMessage: message, stack, componentStack, path, source })
  recordEvent({
    category: 'error',
    name: 'client.error',
    level: 'error',
    success: false,
    metadata: { message, path, source, userId: auth.payload.userId },
    requestPreview: componentStack ?? stack,
  })

  // 204: the client is already in a failure state; there is nothing useful to
  // hand back, and it must not retry on our account.
  return new NextResponse(null, { status: 204 })
})
