'use client'

// fetch() with a hard client-side ceiling.
//
// The AI/Daily calls behind these routes have no server-side deadline of
// their own — the Anthropic SDK defaults to a 10-minute timeout with 2
// retries (lib/ai/client.ts), and lib/daily.ts's calls are plain fetch with no
// signal at all. Without a client-side abort, a slow or stuck provider leaves
// the button spinning indefinitely with no way out for the user. This mirrors
// the pattern already used in VisualizePanel/StudentChatPanel.
//
// Aborting here only detaches the client from the request — it does not
// cancel the work server-side, so a call that finishes late can still land
// (e.g. a practice set generated after the tutor gave up waiting). That's the
// same tradeoff VisualizePanel already makes.

export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** True when `err` is the AbortError fetchWithTimeout raises on its own timeout. */
export function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
