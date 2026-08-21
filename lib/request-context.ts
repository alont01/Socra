import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request context, propagated implicitly through the async call tree.
 *
 * `route()` (lib/api-handler.ts) opens the scope for every API request, so any
 * server module — a Prisma helper, an AI call, an email send — can log with the
 * request id attached without threading it through every signature. That is
 * what makes a production log line traceable back to a single user action.
 *
 * Server-only: this imports node:async_hooks and must never reach the browser
 * bundle. Keep it out of client components (and out of anything they import).
 */
export interface RequestContext {
  requestId: string
  method?: string
  path?: string
  /** Filled in once the handler has authenticated the caller. */
  userId?: string
  role?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

/** Run `fn` with `context` visible to everything it awaits. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

/** The active request's context, or undefined outside a request (jobs, boot). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

/** The active request id, or undefined outside a request. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId
}

/**
 * Attach the authenticated caller to the active context so every subsequent log
 * line in this request carries it. No-op outside a request scope.
 */
export function setRequestActor(actor: { userId?: string | null; role?: string | null }): void {
  const context = storage.getStore()
  if (!context) return
  if (actor.userId) context.userId = actor.userId
  if (actor.role) context.role = actor.role
}
