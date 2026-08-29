import { compileExpr } from './math-eval'

interface Normalized {
  value: string
  /** The letter stripped from a leading "letter =" prefix, or null if none. */
  variable: string | null
}

// Normalize a free-text math answer for comparison: trim, lowercase, drop a
// leading "variable =" prefix (e.g. "x = 2" → "2"), currency symbols, and
// thousands separators inside numbers. The stripped variable letter (if any)
// is returned separately — see the `variable` check in answersMatch, which
// stops "y = 5" from matching a reference answer of "x = 5" (different
// variables) purely because both happened to reduce to the same value.
function normalize(s: string): Normalized {
  let str = String(s ?? '').trim().toLowerCase()
  let variable: string | null = null
  const prefixMatch = str.match(/^([a-z]\w*)\s*=\s*/)
  if (prefixMatch) {
    variable = prefixMatch[1]
    str = str.slice(prefixMatch[0].length)
  }
  str = str
    .replace(/\$/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '') // 1,000 → 1000
    .trim()
  return { value: str, variable }
}

// Recognized unit labels. Letter-suffix matches are restricted to this list
// (plus the ° and % symbols) so an algebraic term like "5n" or "3x" isn't
// mistaken for "5 [unit n]" and marked equivalent to a bare "5" — splitUnit
// used to peel off ANY trailing letter run as a "unit", which meant a
// student's algebraic answer with a coefficient-adjacent variable could be
// graded correct against a same-valued but structurally different reference.
const UNIT_WORDS = new Set([
  'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi',
  'mg', 'g', 'kg', 'lb', 'lbs', 'oz',
  'ms', 's', 'sec', 'secs', 'min', 'mins', 'minute', 'minutes', 'hr', 'hrs', 'hour', 'hours',
  'deg', 'degree', 'degrees',
  'ml', 'l', 'liter', 'liters', 'litre', 'litres', 'pt', 'qt', 'gal',
  'sq', 'sqft', 'sqin', 'sqm', 'sqcm',
])

// Split a normalized answer into its numeric/expression part and a trailing
// unit label, e.g. "34 cm" -> { value: "34", unit: "cm" }, "5%" -> { value:
// "5", unit: "%" }, "1/2" -> { value: "1/2", unit: "" }. Used so a student
// answer that omits (or includes) a unit the reference answer states doesn't
// get marked wrong over that alone.
function splitUnit(s: string): { value: string; unit: string } {
  const m = s.match(/^(.*?)\s*(°|%|[a-z]+)$/i)
  if (!m) return { value: s, unit: '' }
  const rawUnit = m[2].toLowerCase()
  if (rawUnit !== '°' && rawUnit !== '%' && !UNIT_WORDS.has(rawUnit)) {
    return { value: s, unit: '' } // not a recognized unit — leave it in `value`
  }
  return { value: m[1].trim(), unit: rawUnit }
}

/**
 * 1-based positions of problems with no usable answer key.
 *
 * Grading compares against a stored answer, so a problem without one can never
 * be marked correct — the student is told they're wrong whatever they type, and
 * the topic's mastery drops for it. Homework is checked with this before it can
 * be assigned.
 */
export function problemsMissingAnswers(problems: { answer?: string }[]): number[] {
  return problems
    .map((p, i) => (p.answer && p.answer.trim() ? null : i + 1))
    .filter((n): n is number => n !== null)
}

/**
 * Grade a student's answer against the expected answer.
 *
 * Beyond exact (case/whitespace-insensitive) string equality, this accepts
 * mathematically equivalent forms — "1/2", "0.5", ".5", "2/4" all match "0.5",
 * and simple arithmetic ("3+1" matches "4") — by evaluating both sides with the
 * safe expression evaluator. Non-numeric answers fall back to string equality.
 */
export function answersMatch(studentAnswer: string, correctAnswer: string): boolean {
  if (!correctAnswer) return false
  const na = normalize(studentAnswer)
  const nb = normalize(correctAnswer)
  if (!na.value) return false

  // Both sides named a variable and they disagree (e.g. "y = 5" vs a
  // reference of "x = 5") — the values coinciding is not enough; reject
  // before comparing values so this can't be reached through the equality or
  // numeric-equivalence checks below.
  if (na.variable && nb.variable && na.variable !== nb.variable) return false

  const a = na.value
  const b = nb.value
  if (a === b) return true

  // Numeric / expression equivalence, ignoring a trailing unit label when one
  // side omits it or both state the same one — e.g. "34" matches "34 cm",
  // "0.5in" matches "1/2 in". Two *different* stated units (e.g. "5 kg" vs
  // "5 lb") are NOT treated as equivalent — only value equality is checked,
  // not unit conversion. Both value parts must parse and evaluate to finite
  // numbers with no free variables.
  const pa = splitUnit(a)
  const pb = splitUnit(b)
  const unitsCompatible = !pa.unit || !pb.unit || pa.unit === pb.unit
  if (unitsCompatible && pa.value && pb.value) {
    const fa = compileExpr(pa.value)
    const fb = compileExpr(pb.value)
    if (fa && fb) {
      const va = fa({})
      const vb = fb({})
      if (Number.isFinite(va) && Number.isFinite(vb)) {
        const tol = 1e-6 * Math.max(1, Math.abs(vb))
        if (Math.abs(va - vb) <= tol) return true
      }
    }
  }

  return false
}
