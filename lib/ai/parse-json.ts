// Robust JSON extraction for LLM responses.
//
// Models occasionally wrap JSON in prose or fences, add trailing commas, or
// include stray control characters - any of which makes a naive JSON.parse
// throw. This tries a series of increasingly forgiving strategies and returns
// null only if nothing parses, so callers can degrade gracefully instead of
// crashing the pipeline.

// Control chars illegal in JSON, excluding \t \n \r (valid token whitespace).
const ILLEGAL_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

/**
 * Strip `//` line comments and block comments, but never inside a JSON
 * string literal.
 *
 * A naive end-of-line strip (matching `//` anywhere in the text) also cuts
 * through a `//` that's part of a string VALUE, not a comment - a stray
 * `"url": "https://example.com"` in the model's JSON became `"url":
 * "https:` with the rest of the line gone. This tracks string context
 * (respecting `\"` escapes), so only a comment genuinely outside any string
 * gets removed.
 */
function stripComments(s: string): string {
  let out = ''
  let inStr = false
  let esc = false
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (inStr) {
      out += ch
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      i++
      continue
    }
    if (ch === '"') {
      inStr = true
      out += ch
      i++
      continue
    }
    if (ch === '/' && s[i + 1] === '/') {
      i += 2
      while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++
      continue // comment text dropped; resume from the newline (or EOF)
    }
    if (ch === '/' && s[i + 1] === '*') {
      i += 2
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++
      i += 2 // skip the closing marker (harmless overshoot if unterminated)
      continue
    }
    out += ch
    i++
  }
  return out
}

function repair(s: string): string {
  return stripComments(s)
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
