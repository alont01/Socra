/**
 * In-memory store for live practice problem answers.
 * Answers are stored server-side when generated so the student client
 * never sees them, and answer checking is tamper-proof.
 *
 * Same ephemeral pattern as rate-limit.ts — acceptable because live
 * practice problems only matter during an active session.
 */

interface StoredProblem {
  answer: string
  topic: string
}

// Key: "sessionId:problemId" → answer + topic
const store = new Map<string, StoredProblem>()

// Track session → problem IDs for cleanup
const sessionProblems = new Map<string, Set<string>>()

// Clean up sessions that haven't been touched in 4 hours
const sessionTimestamps = new Map<string, number>()
const EXPIRY_MS = 4 * 60 * 60 * 1000

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [sessionId, ts] of sessionTimestamps) {
      if (now - ts > EXPIRY_MS) {
        clearSession(sessionId)
      }
    }
  }, 5 * 60_000)
}

export function storeProblems(
  sessionId: string,
  problems: { id: string; answer: string; topic: string }[],
) {
  // Clear previous problems for this session
  clearSession(sessionId)

  const ids = new Set<string>()
  for (const p of problems) {
    const key = `${sessionId}:${p.id}`
    store.set(key, { answer: p.answer, topic: p.topic })
    ids.add(p.id)
  }
  sessionProblems.set(sessionId, ids)
  sessionTimestamps.set(sessionId, Date.now())
}

export function lookupAnswer(
  sessionId: string,
  problemId: string,
): StoredProblem | null {
  return store.get(`${sessionId}:${problemId}`) || null
}

function clearSession(sessionId: string) {
  const ids = sessionProblems.get(sessionId)
  if (ids) {
    for (const id of ids) {
      store.delete(`${sessionId}:${id}`)
    }
  }
  sessionProblems.delete(sessionId)
  sessionTimestamps.delete(sessionId)
}
