import { compileExpr } from './math-eval'

// Normalize a free-text math answer for comparison: trim, lowercase, drop a
// leading "variable =" prefix (e.g. "x = 2" → "2"), currency symbols, and
// thousands separators inside numbers.
function normalize(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]\w*\s*=\s*/i, '') // "x =", "y=" …
    .replace(/\$/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '') // 1,000 → 1000
    .trim()
}

// Split a normalized answer into its numeric/expression part and a trailing
// unit label, e.g. "34 cm" -> { value: "34", unit: "cm" }, "5%" -> { value:
// "5", unit: "%" }, "1/2" -> { value: "1/2", unit: "" }. Used so a student
// answer that omits (or includes) a unit the reference answer states doesn't
// get marked wrong over that alone.
function splitUnit(s: string): { value: string; unit: string } {
  const m = s.match(/^(.*?)\s*(°|%|[a-z]+)$/i)
  if (!m) return { value: s, unit: '' }
  return { value: m[1].trim(), unit: m[2].toLowerCase() }
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
  const a = normalize(studentAnswer)
  const b = normalize(correctAnswer)
  if (!a) return false
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
