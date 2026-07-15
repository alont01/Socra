import { compileExpr } from '@/lib/math-eval'

const evalAt = (src: string, scope: Record<string, number>) => {
  const f = compileExpr(src)
  if (!f) throw new Error(`failed to compile: ${src}`)
  return f(scope)
}

describe('compileExpr', () => {
  it('evaluates arithmetic with precedence', () => {
    expect(evalAt('2 + 3 * 4', {})).toBe(14)
    expect(evalAt('(2 + 3) * 4', {})).toBe(20)
    expect(evalAt('2 ^ 3 ^ 2', {})).toBe(512) // right-assoc
  })

  it('handles the variable x', () => {
    expect(evalAt('x^2 - 3*x + 1', { x: 2 })).toBe(-1)
  })

  it('supports implicit multiplication', () => {
    expect(evalAt('2x', { x: 5 })).toBe(10)
    expect(evalAt('2(x+1)', { x: 3 })).toBe(8)
    expect(evalAt('2pi', {})).toBeCloseTo(Math.PI * 2)
  })

  it('supports functions and constants', () => {
    expect(evalAt('sin(0)', {})).toBe(0)
    expect(evalAt('sqrt(16)', {})).toBe(4)
    expect(evalAt('abs(-3)', {})).toBe(3)
    expect(evalAt('log(100)', {})).toBeCloseTo(2) // base-10 convention
    expect(evalAt('max(2, 7)', {})).toBe(7)
  })

  it('supports parameters in scope (for sliders)', () => {
    expect(evalAt('a*x^2', { a: 3, x: 2 })).toBe(12)
  })

  it('returns NaN for out-of-domain instead of throwing', () => {
    expect(Number.isNaN(evalAt('sqrt(-1)', {}))).toBe(true)
    expect(Number.isNaN(evalAt('ln(-1)', {}))).toBe(true)
  })

  it('returns null for invalid expressions', () => {
    expect(compileExpr('2 +')).toBeNull()
    expect(compileExpr('(1 + 2')).toBeNull()
    expect(compileExpr('')).toBeNull()
    expect(compileExpr('rm -rf /')).toBeNull()
  })

  it('does not allow unknown identifiers to leak (returns NaN)', () => {
    // `foo` is not in scope or constants -> NaN, not a crash
    expect(Number.isNaN(evalAt('foo + 1', {}))).toBe(true)
  })
})
