'use client'

// Client-side helper for reading every one of the caller's tutoring sessions,
// not just the first page.
//
// GET /api/tutoring-sessions paginates at up to 100/request (see
// app/api/tutoring-sessions/route.ts). Both dashboards used to call it with no
// `limit`/`cursor` at all and treat the resulting 50-row page as the whole
// list — fine for the "recent sessions" panel, but the stat tiles derived from
// that same array (active/completed counts) silently undercounted for any
// tutor or student who had passed 50 sessions. This follows `nextCursor` until
// it runs out.

const PAGE_SIZE = 100

/**
 * Hard ceiling on pages fetched (~1000 sessions) so a runaway `nextCursor`
 * loop — a server bug, or an account with an implausible session count —
 * can't hang the dashboard forever. Real accounts today are nowhere close.
 */
const MAX_PAGES = 10

export async function fetchAllTutoringSessions<T>(): Promise<T[]> {
  const all: T[] = []
  let cursor: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE) })
    if (cursor) qs.set('cursor', cursor)

    const res = await fetch(`/api/tutoring-sessions?${qs.toString()}`)
    if (!res.ok) throw new Error('Failed to load sessions')
    const data = await res.json()

    all.push(...(data.sessions ?? []))
    cursor = data.nextCursor ?? null
    if (!cursor) break
  }

  return all
}
