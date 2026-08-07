// Turns an AI "draw spec" into SVG strings that get rendered onto the Fabric
// whiteboard (as images) during a live session. Pure and framework-free so the
// SVG generation is unit-testable; the Fabric side lives in the Whiteboard.

import { compileExpr } from '@/lib/math-eval'

export interface GraphItem {
  kind: 'graph'
  title?: string
  xDomain: [number, number]
  yDomain?: [number, number]
  series?: { expr: string; color?: string; label?: string }[]
  points?: { x: number; y: number; label?: string }[]
}

export interface NoteItem {
  kind: 'note'
  title?: string
  lines: string[]
}

export type Primitive =
  | { type: 'text'; x: number; y: number; text: string; size?: number; color?: string }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; color?: string; width?: number }
  | { type: 'circle'; cx: number; cy: number; r: number; color?: string }

export interface ShapesItem {
  kind: 'shapes'
  title?: string
  width?: number
  height?: number
  primitives: Primitive[]
}

export type DrawItem = GraphItem | NoteItem | ShapesItem
export interface DrawSpec {
  items: DrawItem[]
}

const INK = '#1c1917'
const AXIS = '#94a3b8'
const ACCENT = '#ea580c'
const SAMPLES = 240

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Validate + normalize a parsed spec, dropping anything malformed. */
export function normalizeDrawSpec(raw: unknown): DrawSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const items = (raw as { items?: unknown }).items
  if (!Array.isArray(items)) return null
  const out: DrawItem[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const kind = (it as { kind?: string }).kind
    if (kind === 'graph') {
      const g = it as Partial<GraphItem>
      if (!Array.isArray(g.xDomain) || !isNum(g.xDomain[0]) || !isNum(g.xDomain[1])) continue
      out.push({
        kind: 'graph',
        title: typeof g.title === 'string' ? g.title : undefined,
        xDomain: [g.xDomain[0], g.xDomain[1]],
        yDomain: Array.isArray(g.yDomain) && isNum(g.yDomain[0]) && isNum(g.yDomain[1]) ? [g.yDomain[0], g.yDomain[1]] : undefined,
        series: Array.isArray(g.series) ? g.series.filter((s) => s && typeof s.expr === 'string') : [],
        points: Array.isArray(g.points) ? g.points.filter((p) => p && isNum(p.x) && isNum(p.y)) : [],
      })
    } else if (kind === 'note') {
      const n = it as Partial<NoteItem>
      const lines = Array.isArray(n.lines) ? n.lines.filter((l) => typeof l === 'string').slice(0, 12) : []
      if (lines.length === 0 && !n.title) continue
      out.push({ kind: 'note', title: typeof n.title === 'string' ? n.title : undefined, lines })
    } else if (kind === 'shapes') {
      const s = it as Partial<ShapesItem>
      const prims = Array.isArray(s.primitives) ? s.primitives.filter(Boolean) : []
      if (prims.length === 0) continue
      out.push({ kind: 'shapes', title: typeof s.title === 'string' ? s.title : undefined, width: isNum(s.width) ? s.width : 480, height: isNum(s.height) ? s.height : 320, primitives: prims as Primitive[] })
    }
  }
  return out.length ? { items: out.slice(0, 4) } : null
}

function buildGraphSvg(g: GraphItem): string {
  const W = 480, H = 320
  const padL = 44, padR = 16, padT = g.title ? 30 : 14, padB = 26
  const bx = padL, by = padT, bw = W - padL - padR, bh = H - padT - padB
  const [xmin, xmax] = g.xDomain[0] < g.xDomain[1] ? g.xDomain : [g.xDomain[1], g.xDomain[0]]

  // Sample series (skip bad exprs); collect ys for auto y-domain.
  const curves: { color: string; pts: [number, number][] }[] = []
  const ys: number[] = []
  for (const s of g.series || []) {
    const fn = compileExpr(s.expr)
    if (!fn) continue
    const pts: [number, number][] = []
    for (let i = 0; i <= SAMPLES; i++) {
      const x = xmin + ((xmax - xmin) * i) / SAMPLES
      let y: number
      try {
        y = fn({ x })
      } catch {
        y = NaN
      }
      if (Number.isFinite(y)) {
        pts.push([x, y])
        ys.push(y)
      }
    }
    curves.push({ color: s.color || ACCENT, pts })
  }
  for (const p of g.points || []) ys.push(p.y)

  let [ymin, ymax] = g.yDomain || [Math.min(...ys), Math.max(...ys)]
  if (!Number.isFinite(ymin) || !Number.isFinite(ymax) || ymin === ymax) {
    ymin = -5; ymax = 5
  }
  const padY = (ymax - ymin) * 0.1
  ymin -= padY; ymax += padY

  const px = (x: number) => bx + ((x - xmin) / (xmax - xmin)) * bw
  const py = (y: number) => by + bh - ((y - ymin) / (ymax - ymin)) * bh

  const parts: string[] = []
  parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#ffffff" stroke="#e7e5e4"/>`)
  // Axes (draw at 0 if in range, else at the edge).
  const yAxisX = xmin <= 0 && xmax >= 0 ? px(0) : bx
  const xAxisY = ymin <= 0 && ymax >= 0 ? py(0) : by + bh
  parts.push(`<line x1="${bx}" y1="${xAxisY.toFixed(1)}" x2="${bx + bw}" y2="${xAxisY.toFixed(1)}" stroke="${AXIS}" stroke-width="1.5"/>`)
  parts.push(`<line x1="${yAxisX.toFixed(1)}" y1="${by}" x2="${yAxisX.toFixed(1)}" y2="${by + bh}" stroke="${AXIS}" stroke-width="1.5"/>`)
  // Domain labels.
  parts.push(`<text x="${bx}" y="${by + bh + 16}" font-size="11" fill="#78716c">${xmin}</text>`)
  parts.push(`<text x="${bx + bw}" y="${by + bh + 16}" font-size="11" fill="#78716c" text-anchor="end">${xmax}</text>`)
  // Curves.
  for (const c of curves) {
    if (c.pts.length < 2) continue
    const d = c.pts.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(' ')
    parts.push(`<polyline points="${d}" fill="none" stroke="${c.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`)
  }
  // Points.
  for (const p of g.points || []) {
    const cx = px(p.x), cy = py(p.y)
    if (cx < bx - 2 || cx > bx + bw + 2 || cy < by - 2 || cy > by + bh + 2) continue
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="${ACCENT}"/>`)
    if (p.label) parts.push(`<text x="${(cx + 6).toFixed(1)}" y="${(cy - 6).toFixed(1)}" font-size="11" fill="${INK}">${esc(p.label)}</text>`)
  }
  const title = g.title ? `<text x="${bx}" y="18" font-size="14" font-weight="700" fill="${INK}">${esc(g.title)}</text>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${title}${parts.join('')}</svg>`
}

function buildNoteSvg(n: NoteItem): string {
  const W = 460
  const lh = 22
  const top = n.title ? 34 : 14
  const H = top + n.lines.length * lh + 12
  const title = n.title ? `<text x="16" y="24" font-size="14" font-weight="700" fill="${INK}">${esc(n.title)}</text>` : ''
  const lines = n.lines
    .map((l, i) => `<text x="16" y="${top + i * lh + 4}" font-size="14" font-family="ui-monospace, Menlo, monospace" fill="#292524">${esc(l)}</text>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="10" fill="#fffbf5" stroke="#fed7aa"/>${title}${lines}</svg>`
}

function buildShapesSvg(s: ShapesItem): string {
  const W = s.width || 480, H = s.height || 320
  const parts: string[] = []
  for (const p of s.primitives) {
    if (p.type === 'line' && isNum(p.x1)) parts.push(`<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${p.color || INK}" stroke-width="${p.width || 2}" stroke-linecap="round"/>`)
    else if (p.type === 'circle' && isNum(p.cx)) parts.push(`<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="none" stroke="${p.color || INK}" stroke-width="2"/>`)
    else if (p.type === 'text' && isNum(p.x)) parts.push(`<text x="${p.x}" y="${p.y}" font-size="${p.size || 14}" fill="${p.color || INK}">${esc(p.text)}</text>`)
  }
  const title = s.title ? `<text x="12" y="18" font-size="14" font-weight="700" fill="${INK}">${esc(s.title)}</text>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${title}${parts.join('')}</svg>`
}

export function buildItemSvg(item: DrawItem): string {
  if (item.kind === 'graph') return buildGraphSvg(item)
  if (item.kind === 'note') return buildNoteSvg(item)
  return buildShapesSvg(item)
}

/** One SVG string per item, in order. */
export function buildSpecSvgs(spec: DrawSpec): string[] {
  return spec.items.map(buildItemSvg)
}
