import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { createLogger, serializeError } from '@/lib/logger'
import { recordEvent } from '@/lib/metrics'
import { runWithRequestContext } from '@/lib/request-context'

/**
 * The single entry point every API route goes through.
 *
 * `route()` gives each request an id, opens a request-scoped logging context,
 * times the handler, and converts anything thrown into a consistent JSON error
 * response — so a new route cannot forget its try/catch, and a 500 in
 * production always leaves a structured, traceable log line behind.
 */

/** Header used to accept an upstream correlation id and to echo ours back. */
export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * An error carrying the HTTP status it should produce. Throw this from helper
 * code that is too deep to build a response itself; `route()` renders it.
 *
 * `message` is sent to the client, so it must be safe to expose. For internal
 * detail that should stay in the logs, pass `cause`.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
  }
}

export const badRequest = (message: string) => new ApiError(400, message)
export const unauthorized = (message = 'Unauthorized') => new ApiError(401, message)
export const forbidden = (message = 'Forbidden') => new ApiError(403, message)
export const notFound = (message = 'Not found') => new ApiError(404, message)
export const conflict = (message: string) => new ApiError(409, message)

/** What Next.js passes as the second argument to a route handler. */
type DefaultRouteContext = { params: Promise<Record<string, string | string[]>> }

type Handler<Ctx> = (request: Request, context: Ctx) => Promise<Response> | Response

interface MappedError {
  status: number
  /** Message safe to return to the client. */
  message: string
}

/**
 * Map a thrown value onto a client-facing status + message.
 *
 * Anything not recognised becomes a generic 500: an unexpected error's message
 * can contain connection strings, row data, or stack fragments, none of which
 * belong in a response body. The real error is always logged.
 */
export function mapError(error: unknown): MappedError {
  if (error instanceof ApiError) {
    return { status: error.status, message: error.message }
  }

  // Malformed request body — `await request.json()` throws a SyntaxError. This
  // is the caller's mistake, not ours, and used to surface as a 500.
  if (error instanceof SyntaxError) {
    return { status: 400, message: 'Invalid JSON body' }
  }

  if (error instanceof Error && error.name === 'ZodError') {
    return { status: 400, message: 'Invalid request body' }
  }

  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string') {
    switch (code) {
      case 'P2002': // unique constraint violation
        return { status: 409, message: 'That record already exists' }
      case 'P2025': // record required by the operation was not found
        return { status: 404, message: 'Not found' }
      case 'P2003': // foreign key constraint violation
        return { status: 400, message: 'Referenced record does not exist' }
    }
  }

  return { status: 500, message: 'Internal server error' }
}

export interface RouteOptions {
  /**
   * Client-facing message for an unexpected 500, when the generic
   * "Internal server error" would leave the user without a next step
   * (e.g. "Could not start the assessment. Please try again.").
   * Never interpolate internal detail into it — it is sent to the client.
   */
  errorMessage?: string
}

/**
 * Wrap a Next.js route handler.
 *
 * `module` is the log/metric label for the route — by convention its path
 * without the `app/api` prefix, e.g. `tutoring-sessions/[id]/end`.
 */
export function route<Ctx = DefaultRouteContext>(
  module: string,
  handler: Handler<Ctx>,
  options: RouteOptions = {},
): (request: Request, context: Ctx) => Promise<Response> {
  const logger = createLogger(module)

  return async function wrappedRoute(request: Request, context: Ctx): Promise<Response> {
    const requestId = request.headers.get(REQUEST_ID_HEADER)?.trim() || randomUUID()
    const method = request.method
    const path = safePath(request.url)
    const startedAt = Date.now()

    return runWithRequestContext({ requestId, method, path }, async () => {
      try {
        const response = await handler(request, context)
        const durationMs = Date.now() - startedAt
        tagResponse(response, requestId)
        logCompletion(logger, { method, path, status: response.status, durationMs, requestId })
        // A streamed response has already "succeeded" by this point — the
        // status line and headers went out before a single token did. If the
        // stream then dies, nothing above would ever know. See watchStream.
        return watchStream(response, logger, { module, method, path, requestId, startedAt })
      } catch (error) {
        // `redirect()` and `notFound()` signal control flow by throwing. They
        // are not failures and must reach Next's own handler untouched —
        // swallowing one turns a redirect into a 500.
        if (isNextControlFlow(error)) throw error

        const durationMs = Date.now() - startedAt
        const mapped = mapError(error)
        const { status } = mapped
        // Only an unrecognised failure gets the route's custom wording; an
        // ApiError already chose its own message deliberately.
        const message =
          status === 500 && !(error instanceof ApiError) && options.errorMessage
            ? options.errorMessage
            : mapped.message

        // 5xx is ours to fix and gets the stack plus a telemetry event; a 4xx
        // raised by a thrown ApiError is expected traffic, not an incident.
        if (status >= 500) {
          logger.error('Unhandled error in route', error, { method, path, status, durationMs })
          // The stack goes to the log line, not into the event row: metadata is
          // stored unbounded, and a stack on every 500 bloats the table during
          // exactly the incident that produces the most of them.
          const { errorName, errorMessage, errorCode } = serializeError(error)
          recordEvent({
            category: 'error',
            name: `http.${status}`,
            level: 'error',
            success: false,
            durationMs,
            metadata: { module, method, path, requestId, errorName, errorMessage, errorCode },
          })
        } else {
          logger.warn('Request rejected', { method, path, status, durationMs, reason: message })
        }

        const response = NextResponse.json({ error: message, requestId }, { status })
        tagResponse(response, requestId)
        return response
      }
    })
  }
}

/**
 * Wrap a streamed response so a mid-stream failure is still logged and counted.
 *
 * `route()` logs the moment the handler returns, which for a normal response is
 * the whole story. A streaming route (SSE — the student chat) is different: it
 * returns 200 plus an open ReadableStream in about a millisecond, and only then
 * starts calling the model. When that call fails the connection is torn down
 * and the platform reports a 500, but the wrapper had already recorded a
 * `debug`-level 200 and no `http.5xx` event. The one route where a failure is
 * most visible to a user was the one route invisible to the logs.
 *
 * Only SSE responses are wrapped. Everything else is handed back untouched:
 * a buffered body is fully materialized before it gets here, so there is no
 * later failure to catch and nothing to gain from rebuilding the response.
 */
function watchStream(
  response: Response,
  logger: ReturnType<typeof createLogger>,
  entry: { module: string; method: string; path: string; requestId: string; startedAt: number },
): Response {
  const body = response.body
  if (!body) return response
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return response

  return new Response(guardStream(body, logger, entry), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/**
 * Report a stream that dies partway through with the same weight `route()`
 * gives a thrown 500 — an error log line plus an `http.500` event — so a broken
 * SSE route shows up on the admin dashboard instead of reading as healthy.
 */
function guardStream(
  stream: ReadableStream<Uint8Array>,
  logger: ReturnType<typeof createLogger>,
  entry: { module: string; method: string; path: string; requestId: string; startedAt: number },
): ReadableStream<Uint8Array> {
  const { module, method, path, requestId, startedAt } = entry
  const reader = stream.getReader()

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          return
        }
        controller.enqueue(value)
      } catch (error) {
        const durationMs = Date.now() - startedAt
        logger.error('Response stream failed after headers were sent', error, {
          method, path, status: 500, durationMs, requestId,
        })
        const { errorName, errorMessage, errorCode } = serializeError(error)
        recordEvent({
          category: 'error',
          name: 'http.500',
          level: 'error',
          success: false,
          durationMs,
          metadata: { module, method, path, requestId, errorName, errorMessage, errorCode, streamed: true },
        })
        controller.error(error)
      }
    },
    cancel(reason) {
      // The client went away mid-stream (closed the tab, navigated). Normal.
      void reader.cancel(reason)
    },
  })
}

/**
 * Next.js marks its internal control-flow throws (redirect, notFound, dynamic
 * bailout) with a `digest` string rather than a distinct error class.
 */
function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest
  return typeof digest === 'string' && (digest.startsWith('NEXT_') || digest === 'DYNAMIC_SERVER_USAGE')
}

/**
 * Echo the correlation id so a client (or a user reporting a bug) can quote the
 * exact request. Streamed and redirect responses can have locked headers, so a
 * failure here must not take down an otherwise good response.
 */
function tagResponse(response: Response, requestId: string): void {
  try {
    response.headers.set(REQUEST_ID_HEADER, requestId)
  } catch {
    // Immutable headers — the id is still in the logs.
  }
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

function logCompletion(
  logger: ReturnType<typeof createLogger>,
  entry: { method: string; path: string; status: number; durationMs: number; requestId: string },
): void {
  const { status, durationMs } = entry

  // A handler that returned a 5xx itself never threw, so nothing above would
  // have logged it. Record it with the same weight as a thrown failure.
  if (status >= 500) {
    logger.error('Request failed', undefined, entry)
    recordEvent({
      category: 'error',
      name: `http.${status}`,
      level: 'error',
      success: false,
      durationMs,
      metadata: entry,
    })
    return
  }

  if (durationMs >= config.observability.slowRequestMs) {
    logger.warn('Slow request', entry)
    return
  }

  if (status >= 400) {
    logger.info('Request rejected', entry)
    return
  }

  // Successful requests are per-request noise in production; the platform's own
  // access log already covers them.
  logger.debug('Request completed', entry)
}
