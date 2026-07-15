// Safe math expression evaluator (no eval / no Function constructor).
//
// Tokenizes and parses a math expression into an AST, then evaluates it against
// a scope (e.g. { x, a }). Supports + - * / ^ (right-assoc), unary minus,
// implicit multiplication (2x, 3(x+1), 2pi), constants (pi, e, tau), and a
// whitelist of single/two-arg functions. Out-of-domain results return NaN so
// the plotter can break the line instead of throwing.

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'unary'; op: '-' | '+'; arg: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; l: Node; r: Node }
  | { t: 'call'; name: string; args: Node[] }

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  exp: Math.exp, ln: Math.log, log10: Math.log10, log2: Math.log2,
  log: Math.log10, // common convention in school math
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow,
  atan2: Math.atan2,
}

const CONSTS: Record<string, number> = {
  pi: Math.PI, e: Math.E, tau: Math.PI * 2,
}

type Tok =
  | { k: 'num'; v: number }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string }
  | { k: 'lp' }
  | { k: 'rp' }
  | { k: 'comma' }

function tokenize(src: string): Tok[] | null {
  const toks: Tok[] = []
  let i = 0
  const s = src
  while (i < s.length) {
    const c = s[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }
    if (c >= '0' && c <= '9' || (c === '.' && s[i + 1] >= '0' && s[i + 1] <= '9')) {
      let j = i + 1
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++
      // scientific notation: 1e-3
      if (s[j] === 'e' || s[j] === 'E') {
        let k = j + 1
        if (s[k] === '+' || s[k] === '-') k++
        if (s[k] >= '0' && s[k] <= '9') { j = k + 1; while (j < s.length && s[j] >= '0' && s[j] <= '9') j++ }
      }
      const num = Number(s.slice(i, j))
      if (!Number.isFinite(num)) return null
      toks.push({ k: 'num', v: num })
      i = j
      continue
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let j = i + 1
      while (j < s.length && ((s[j] >= 'a' && s[j] <= 'z') || (s[j] >= 'A' && s[j] <= 'Z') || (s[j] >= '0' && s[j] <= '9') || s[j] === '_')) j++
      toks.push({ k: 'id', v: s.slice(i, j).toLowerCase() })
      i = j
      continue
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') { toks.push({ k: 'op', v: c }); i++; continue }
    if (c === '(') { toks.push({ k: 'lp' }); i++; continue }
    if (c === ')') { toks.push({ k: 'rp' }); i++; continue }
    if (c === ',') { toks.push({ k: 'comma' }); i++; continue }
    return null // unknown character
  }
  return toks
}

// Pratt parser with implicit multiplication.
function parse(toks: Tok[]): Node | null {
  let pos = 0
  const peek = () => toks[pos]
  const next = () => toks[pos++]

  const BIN_PREC: Record<string, number> = { '+': 10, '-': 10, '*': 20, '/': 20, '^': 30 }

  function parseExpr(minPrec: number): Node | null {
    let left = parseUnary()
    if (!left) return null

    for (;;) {
      const t = peek()
      // implicit multiplication: a primary directly followed by another primary
      if (t && (t.k === 'num' || t.k === 'id' || t.k === 'lp')) {
        if (20 < minPrec) break
        const right = parseExpr(20 + 1)
        if (!right) return null
        left = { t: 'bin', op: '*', l: left, r: right }
        continue
      }
      if (!t || t.k !== 'op') break
      const prec = BIN_PREC[t.v]
      if (prec === undefined || prec < minPrec) break
      next()
      const rightAssoc = t.v === '^'
      const right = parseExpr(rightAssoc ? prec : prec + 1)
      if (!right) return null
      left = { t: 'bin', op: t.v as '+' | '-' | '*' | '/' | '^', l: left, r: right }
    }
    return left
  }

  function parseUnary(): Node | null {
    const t = peek()
    if (t && t.k === 'op' && (t.v === '-' || t.v === '+')) {
      next()
      const arg = parseUnary()
      if (!arg) return null
      return { t: 'unary', op: t.v as '-' | '+', arg }
    }
    return parsePrimary()
  }

  function parsePrimary(): Node | null {
    const t = next()
    if (!t) return null
    if (t.k === 'num') return { t: 'num', v: t.v }
    if (t.k === 'lp') {
      const e = parseExpr(0)
      if (!e) return null
      if (peek()?.k !== 'rp') return null
      next()
      return e
    }
    if (t.k === 'id') {
      // function call?
      if (peek()?.k === 'lp' && FUNCS[t.v]) {
        next() // consume (
        const args: Node[] = []
        if (peek()?.k !== 'rp') {
          for (;;) {
            const a = parseExpr(0)
            if (!a) return null
            args.push(a)
            if (peek()?.k === 'comma') { next(); continue }
            break
          }
        }
        if (peek()?.k !== 'rp') return null
        next()
        return { t: 'call', name: t.v, args }
      }
      return { t: 'var', name: t.v }
    }
    return null
  }

  const node = parseExpr(0)
  if (!node || pos !== toks.length) return null
  return node
}

function evalNode(n: Node, scope: Record<string, number>): number {
  switch (n.t) {
    case 'num': return n.v
    case 'var': {
      if (n.name in scope) return scope[n.name]
      if (n.name in CONSTS) return CONSTS[n.name]
      return NaN
    }
    case 'unary': return n.op === '-' ? -evalNode(n.arg, scope) : evalNode(n.arg, scope)
    case 'bin': {
      const l = evalNode(n.l, scope)
      const r = evalNode(n.r, scope)
      switch (n.op) {
        case '+': return l + r
        case '-': return l - r
        case '*': return l * r
        case '/': return l / r
        case '^': return Math.pow(l, r)
      }
      return NaN
    }
    case 'call': {
      const fn = FUNCS[n.name]
      if (!fn) return NaN
      return fn(...n.args.map((a) => evalNode(a, scope)))
    }
  }
}

export type CompiledExpr = (scope: Record<string, number>) => number

/**
 * Compile a math expression into a reusable evaluator, or return null if it
 * can't be parsed. The returned function evaluates against a scope of variable
 * values (e.g. { x: 2, a: 1 }) and returns NaN for out-of-domain results.
 */
export function compileExpr(src: string): CompiledExpr | null {
  if (typeof src !== 'string' || !src.trim()) return null
  const toks = tokenize(src)
  if (!toks || toks.length === 0) return null
  const ast = parse(toks)
  if (!ast) return null
  return (scope: Record<string, number>) => {
    try {
      const v = evalNode(ast, scope)
      return typeof v === 'number' ? v : NaN
    } catch {
      return NaN
    }
  }
}
