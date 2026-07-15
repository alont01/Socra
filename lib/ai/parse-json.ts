// Robust JSON extraction for LLM responses.
//
// Models occasionally wrap JSON in prose or fences, add trailing commas, or
// include stray control characters - any of which makes a naive JSON.parse
// throw. This tries a series of increasingly forgiving strategies and returns
// null only if nothing parses, so callers can degrade gracefully instead of
// crashing the pipeline.

// Control chars illegal in JSON, excluding \t \n \r (valid token whitespace).
const ILLEGAL_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

function repair(s: string): string {
  return s
    // strip // line comments and /* block */ comments
    .replace(/\/\/[^\n\r]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // remove trailing commas before a closing } or ]
    .replace(/,\s*([}\]])/g, '$1')
    .replace(ILLEGAL_CONTROL, '')
}

function tryParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T
  } catch {
    // fall through to a repaired attempt
  }
  try {
    return JSON.parse(repair(s)) as T
  } catch {
    return null
  }
}

// Return the outermost balanced {...} or [...] substring, ignoring brackets
// inside string literals. Handles the common "prose before/after JSON" case.
function sliceOutermost(s: string): string | null {
  const firstObj = s.indexOf('{')
  const firstArr = s.indexOf('[')
  let start = -1
  let open = '{'
  let close = '}'
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    start = firstArr; open = '['; close = ']'
  } else if (firstObj !== -1) {
    start = firstObj; open = '{'; close = '}'
  }
  if (start === -1) return null

  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') {
      inStr = true
    } else if (ch === open) {
      depth++
    } else if (ch === close) {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Best-effort extraction of a JSON value from a raw LLM response.
 * Returns the parsed value, or null if no strategy succeeds.
 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null
  const trimmed = raw.trim()

  const candidates: string[] = [trimmed]

  // Content inside a ```json ... ``` (or plain ```) fence.
  const fence = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/i)
  if (fence) candidates.push(fence[1].trim())

  // Outermost balanced brackets, from the whole string and from the fence.
  const sliced = sliceOutermost(trimmed)
  if (sliced) candidates.push(sliced)
  if (fence) {
    const s = sliceOutermost(fence[1])
    if (s) candidates.push(s)
  }

  for (const c of candidates) {
    const parsed = tryParse<T>(c)
    if (parsed !== null && parsed !== undefined) return parsed
  }
  return null
}
