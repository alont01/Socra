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

  // Numeric / expression equivalence. Both must parse and evaluate to finite
  // numbers with no free variables.
  const fa = compileExpr(a)
  const fb = compileExpr(b)
  if (fa && fb) {
    const va = fa({})
    const vb = fb({})
    if (Number.isFinite(va) && Number.isFinite(vb)) {
      const tol = 1e-6 * Math.max(1, Math.abs(vb))
      if (Math.abs(va - vb) <= tol) return true
    }
  }

  return false
}
