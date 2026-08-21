import { getRequestContext } from './request-context'

/**
 * Structured application logger.
 *
 * Production emits one JSON object per line so the hosting platform's log
 * search can filter on `level`, `module`, `requestId`, `userId`, and duration
 * instead of grepping prose. Development emits a compact human-readable line.
 *
 * Every entry is automatically stamped with the active request's id and actor
 * (see lib/request-context.ts), so a single user action can be traced across
 * the route, the AI call, and the database write it triggered.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Minimum level to emit. `LOG_LEVEL` overrides; otherwise production keeps
 * `info` and above (debug is per-request noise) and development shows all.
 */
const minWeight = LEVEL_WEIGHT[resolveLevel()]

function resolveLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase()
  if (raw && raw in LEVEL_WEIGHT) return raw as LogLevel
  return isProduction ? 'info' : 'debug'
}

// Field names whose values must never reach a log sink, matched
// case-insensitively against the key. Logs are retained and widely readable;
// a credential that lands in one has to be treated as compromised.
//
// Deliberately NOT matched: `sessionId`, which throughout this app means a
// TutoringSession row id — the single most useful field for tracing the
// post-session pipeline, and not a credential.
const SECRET_KEY = /(password|secret|token|apikey|api_key|authorization|cookie|codehash)/i

const REDACTED = '[redacted]'
const MAX_DEPTH = 4
const MAX_STRING = 2000

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[+${value.length - MAX_STRING} chars]` : value
  }
  if (typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (depth >= MAX_DEPTH) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? REDACTED : redact(item, depth + 1)
  }
  return out
}

/** Flatten an unknown thrown value into loggable fields. */
export function serializeError(error: unknown, depth = 0): Record<string, unknown> {
  if (depth > 3) return { error: '[cause chain truncated]' }
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    }
    // Prisma and fetch-style errors carry a machine-readable code worth keeping.
    const code = (error as { code?: unknown }).code
    if (code !== undefined) serialized.errorCode = code
    // An ApiError raised to shape the client response usually wraps the real
    // failure as `cause`; without this the log would only show the friendly text.
    if (error.cause !== undefined) serialized.cause = serializeError(error.cause, depth + 1)
    return serialized
  }
  if (error === undefined) return {}
  return { error: String(error) }
}

interface Emit {
  level: LogLevel
  module: string
  message: string
  bindings: Record<string, unknown>
  data?: Record<string, unknown>
}

function write({ level, module, message, bindings, data }: Emit): void {
  if (LEVEL_WEIGHT[level] < minWeight) return

  const context = getRequestContext()
  const fields = redact({ ...bindings, ...data }) as Record<string, unknown>
  const timestamp = new Date().toISOString()

  // console.error for warn/error routes them to stderr, which most platforms
  // surface separately from ordinary output.
  const sink = level === 'error' || level === 'warn' ? console.error : console.log

  if (isProduction) {
    sink(
      JSON.stringify({
        ts: timestamp,
        level,
        module,
        msg: message,
        requestId: context?.requestId,
        userId: context?.userId,
        ...fields,
      }),
    )
    return
  }

  const suffix = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : ''
  const requestId = context?.requestId ? ` [${context.requestId.slice(0, 8)}]` : ''
  sink(`[${timestamp}] [${level.toUpperCase()}] [${module}]${requestId} ${message}${suffix}`)
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  /** `error` accepts the thrown value directly; its name/message/stack/code are extracted. */
  error(message: string, error?: unknown, data?: Record<string, unknown>): void
  /** Derive a logger that stamps `bindings` onto every entry. */
  child(bindings: Record<string, unknown>): Logger
}

function build(module: string, bindings: Record<string, unknown>): Logger {
  return {
    debug: (message, data) => write({ level: 'debug', module, message, bindings, data }),
    info: (message, data) => write({ level: 'info', module, message, bindings, data }),
    warn: (message, data) => write({ level: 'warn', module, message, bindings, data }),
    error: (message, error, data) =>
      write({ level: 'error', module, message, bindings, data: { ...data, ...serializeError(error) } }),
    child: (extra) => build(module, { ...bindings, ...extra }),
  }
}

/** Create a structured logger scoped to a module name. */
export function createLogger(module: string): Logger {
  return build(module, {})
}
