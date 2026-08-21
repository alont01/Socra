/**
 * Ship a browser-side crash to the server log (see app/api/client-errors).
 *
 * Best-effort and never throws: it runs from an error boundary, so a failure
 * here would replace a rendered fallback with a second, worse crash.
 */
export function reportClientError(
  error: unknown,
  context: { source: string; componentStack?: string },
): void {
  if (typeof window === 'undefined') return

  try {
    const payload = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      componentStack: context.componentStack,
      // Pathname only — a query string can carry invite codes or reset tokens.
      path: window.location.pathname,
      source: context.source,
    }

    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // The page may be navigating away or reloading right after this.
      keepalive: true,
    }).catch(() => {
      // Reporting is best-effort; the console still has the original error.
    })
  } catch {
    // Never let telemetry break the fallback UI.
  }
}
