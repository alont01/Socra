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

export type Anchor = 'start' | 'middle' | 'end'

export type Primitive = PrimitiveBase & OpacityProp

type PrimitiveBase =
  | { type: 'text'; x: number; y: number; text: string; size?: number; color?: string; anchor?: Anchor; bold?: boolean }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; color?: string; width?: number; dashed?: boolean }
  | { type: 'circle'; cx: number; cy: number; r: number; color?: string; fill?: string; width?: number }
  | { type: 'rect'; x: number; y: number; width: number; height: number; color?: string; fill?: string }
  | { type: 'polygon'; points: Pt[]; color?: string; fill?: string; width?: number }
  | { type: 'polyline'; points: Pt[]; color?: string; width?: number; dashed?: boolean }
  // Corner markers: (x,y) is the vertex, (ax,ay)/(bx,by) are points along the
  // two rays. Drawn at a fixed on-screen size so they survive auto-fit scaling.
  | { type: 'rightangle'; x: number; y: number; ax: number; ay: number; bx: number; by: number; color?: string }
  | { type: 'arc'; x: number; y: number; ax: number; ay: number; bx: number; by: number; label?: string; color?: string }
  // Annotation marks. An arrow points at the thing being talked about; a brace
  // measures a length. Both are drawn at a fixed on-screen size.
  | { type: 'arrow'; x1: number; y1: number; x2: number; y2: number; label?: string; color?: string; width?: number; dashed?: boolean }
  | { type: 'brace'; x1: number; y1: number; x2: number; y2: number; label?: string; color?: string; flip?: boolean }

/** Every primitive also accepts an opacity, for dimming scaffolding. */
export type OpacityProp = { opacity?: number }

export interface ShapesItem {
  kind: 'shapes'
  title?: string
  width?: number
  height?: number
  primitives: Primitive[]
}

/**
 * A staged explanation: frames over one shared coordinate space, each adding to
 * the last. The figure is fitted once across every step, so it never jumps or
 * rescales as the tutor reveals the next frame — that stability is what makes a
 * build-up read as one continuous idea rather than a slideshow.
 */
export interface SequenceItem {
  kind: 'sequence'
  title?: string
  width?: number
  height?: number
  steps: {
    caption?: string
    add: Primitive[]
    /** Start this frame from an empty canvas — for when the picture changes
     *  rather than grows, e.g. the same pieces rearranged. */
    clear?: boolean
  }[]
}

export type DrawItem = GraphItem | NoteItem | ShapesItem | SequenceItem
export interface DrawSpec {
  items: DrawItem[]
}

/** One rendered frame: an SVG plus the line the tutor says while showing it. */
export interface Frame {
  svg: string
  caption?: string
}

export type Pt = [number, number]

const INK = '#1c1917'
const AXIS = '#94a3b8'
const ACCENT = '#ea580c'
const SAMPLES = 240

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Accept the three point-list shapes models actually emit: [[x,y],...],
 * a flat [x,y,x,y,...], or an SVG-style "x,y x,y" string.
 */
function toPoints(raw: unknown): Pt[] {
  let flat: number[] = []
  if (typeof raw === 'string') {
    flat = raw.trim().split(/[\s,]+/).map(Number)
  } else if (Array.isArray(raw)) {
    if (raw.every((p) => Array.isArray(p))) {
      const pts: Pt[] = []
      for (const p of raw as unknown[][]) {
        const [x, y] = [Number(p[0]), Number(p[1])]
        if (isNum(x) && isNum(y)) pts.push([x, y])
      }
      return pts
    }
    if (raw.every((p) => p && typeof p === 'object' && 'x' in (p as object))) {
      const pts: Pt[] = []
      for (const p of raw as { x: unknown; y: unknown }[]) {
        const [x, y] = [Number(p.x), Number(p.y)]
        if (isNum(x) && isNum(y)) pts.push([x, y])
      }
      return pts
    }
    flat = raw.map(Number)
  } else {
    return []
  }
  const pts: Pt[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    if (isNum(flat[i]) && isNum(flat[i + 1])) pts.push([flat[i], flat[i + 1]])
  }
  return pts
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

/**
 * Validate one primitive, dropping anything malformed. Without this, unknown
 * shapes (a polygon the renderer didn't handle, say) used to survive
 * normalization and then vanish at render time — the figure came out as a
 * couple of orphaned lines instead of failing loudly.
 */
function normalizePrimitive(raw: unknown): Primitive | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const type = String(p.type || '').toLowerCase()
  const color = str(p.color) || str(p.stroke)
  const width = isNum(p.width) ? p.width : isNum(p.strokeWidth) ? (p.strokeWidth as number) : undefined
  const opacity = isNum(p.opacity) && p.opacity >= 0 && p.opacity <= 1 ? p.opacity : undefined
  const withOpacity = <T extends PrimitiveBase>(prim: T): T & OpacityProp =>
    opacity === undefined ? prim : { ...prim, opacity }

  switch (type) {
    case 'text': {
      const text = typeof p.text === 'string' ? p.text : typeof p.label === 'string' ? p.label : ''
      if (!text || !isNum(p.x) || !isNum(p.y)) return null
      const anchor = p.anchor === 'middle' || p.anchor === 'end' ? p.anchor : 'start'
      return withOpacity({
        type: 'text', x: p.x, y: p.y, text, anchor, color,
        size: isNum(p.size) ? p.size : undefined,
        bold: p.bold === true || p.weight === 'bold',
      })
    }
    case 'line':
      if (!isNum(p.x1) || !isNum(p.y1) || !isNum(p.x2) || !isNum(p.y2)) return null
      return withOpacity({ type: 'line', x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, color, width, dashed: p.dashed === true })
    case 'circle':
      if (!isNum(p.cx) || !isNum(p.cy) || !isNum(p.r) || p.r <= 0) return null
      return withOpacity({ type: 'circle', cx: p.cx, cy: p.cy, r: p.r, color, fill: str(p.fill), width })
    case 'rect':
      if (!isNum(p.x) || !isNum(p.y) || !isNum(p.width) || !isNum(p.height)) return null
      return withOpacity({ type: 'rect', x: p.x, y: p.y, width: p.width, height: p.height, color, fill: str(p.fill) })
    case 'polygon':
    case 'triangle': {
      const points = toPoints(p.points ?? p.vertices)
      if (points.length < 3) return null
      return withOpacity({ type: 'polygon', points, color, fill: str(p.fill), width })
    }
    case 'polyline':
    case 'path': {
      const points = toPoints(p.points ?? p.vertices)
      if (points.length < 2) return null
      return withOpacity({ type: 'polyline', points, color, width, dashed: p.dashed === true })
    }
    case 'rightangle':
    case 'right-angle':
    case 'rightanglemarker':
      if (!isNum(p.x) || !isNum(p.y) || !isNum(p.ax) || !isNum(p.ay) || !isNum(p.bx) || !isNum(p.by)) return null
      return withOpacity({ type: 'rightangle', x: p.x, y: p.y, ax: p.ax, ay: p.ay, bx: p.bx, by: p.by, color })
    case 'arc':
    case 'angle':
      if (!isNum(p.x) || !isNum(p.y) || !isNum(p.ax) || !isNum(p.ay) || !isNum(p.bx) || !isNum(p.by)) return null
      return withOpacity({ type: 'arc', x: p.x, y: p.y, ax: p.ax, ay: p.ay, bx: p.bx, by: p.by, label: str(p.label), color })
    case 'arrow':
      if (!isNum(p.x1) || !isNum(p.y1) || !isNum(p.x2) || !isNum(p.y2)) return null
      return withOpacity({ type: 'arrow', x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, label: str(p.label), color, width, dashed: p.dashed === true })
    case 'brace':
    case 'dimension':
      if (!isNum(p.x1) || !isNum(p.y1) || !isNum(p.x2) || !isNum(p.y2)) return null
      return withOpacity({ type: 'brace', x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, label: str(p.label), color, flip: p.flip === true })
    default:
      return null
  }
}

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
    } else if (kind === 'sequence') {
      const q = it as Partial<SequenceItem>
      const rawSteps = Array.isArray(q.steps) ? q.steps.slice(0, 6) : []
      const steps: SequenceItem['steps'] = []
      for (const st of rawSteps) {
        if (!st || typeof st !== 'object') continue
        const add = (Array.isArray(st.add) ? st.add : [])
          .map(normalizePrimitive)
          .filter((x): x is Primitive => x !== null)
        const caption = typeof st.caption === 'string' && st.caption.trim() ? st.caption.trim() : undefined
        if (add.length === 0 && !caption) continue
        steps.push({ caption, add, clear: st.clear === true })
      }
      // A build-up needs something to build and more than one beat; anything
      // less is just a static figure, so fall through to that instead.
      const drawn = steps.flatMap((st) => st.add)
      if (!drawn.some((pr) => pr.type !== 'text')) continue
      if (steps.length < 2) {
        out.push({ kind: 'shapes', title: typeof q.title === 'string' ? q.title : undefined, width: isNum(q.width) ? q.width : 480, height: isNum(q.height) ? q.height : 320, primitives: drawn })
        continue
      }
      out.push({
        kind: 'sequence',
        title: typeof q.title === 'string' ? q.title : undefined,
        width: isNum(q.width) ? q.width : 480,
        height: isNum(q.height) ? q.height : 320,
        steps,
      })
    } else if (kind === 'shapes') {
      const s = it as Partial<ShapesItem>
      const raws = Array.isArray(s.primitives) ? s.primitives : []
      const prims = raws.map(normalizePrimitive).filter((p): p is Primitive => p !== null)
      // A figure of nothing but labels isn't a figure — let the caller fall
      // back rather than placing an empty box on the shared whiteboard.
      if (!prims.some((p) => p.type !== 'text')) continue
      out.push({
        kind: 'shapes',
        title: typeof s.title === 'string' ? s.title : undefined,
        width: isNum(s.width) ? s.width : 480,
        height: isNum(s.height) ? s.height : 320,
        primitives: prims,
      })
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

const NOTE_WRAP = 52

/** Wrap on word boundaries so a long line can't run off the note card. */
function wrapLine(line: string, max = NOTE_WRAP): string[] {
  if (line.length <= max) return [line]
  const out: string[] = []
  let cur = ''
  for (const word of line.split(' ')) {
    if (!cur) cur = word
    else if (cur.length + 1 + word.length <= max) cur += ' ' + word
    else {
      out.push(cur)
      cur = word
    }
    // A single unbreakable token longer than the line width.
    while (cur.length > max) {
      out.push(cur.slice(0, max))
      cur = cur.slice(max)
    }
  }
  if (cur) out.push(cur)
  return out
}

function buildNoteSvg(n: NoteItem): string {
  const W = 460
  const lh = 22
  const top = n.title ? 44 : 14
  const lines = n.lines.flatMap((l) => wrapLine(l))
  const H = top + lines.length * lh + 12
  const title = n.title ? `<text x="16" y="24" font-size="14" font-weight="700" fill="${INK}">${esc(n.title)}</text>` : ''
  const body = lines
    .map((l, i) => `<text x="16" y="${top + i * lh + 4}" font-size="14" font-family="ui-monospace, Menlo, monospace" fill="#292524">${esc(l)}</text>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="10" fill="#fffbf5" stroke="#fed7aa"/>${title}${body}</svg>`
}

/** Every coordinate a primitive occupies, used to fit the figure to the frame. */
function primitiveExtent(p: Primitive): Pt[] {
  switch (p.type) {
    case 'text': return [[p.x, p.y]]
    case 'line': return [[p.x1, p.y1], [p.x2, p.y2]]
    case 'circle': return [[p.cx - p.r, p.cy - p.r], [p.cx + p.r, p.cy + p.r]]
    case 'rect': return [[p.x, p.y], [p.x + p.width, p.y + p.height]]
    case 'polygon':
    case 'polyline': return p.points
    case 'rightangle':
    case 'arc': return [[p.x, p.y], [p.ax, p.ay], [p.bx, p.by]]
    case 'arrow':
    case 'brace': return [[p.x1, p.y1], [p.x2, p.y2]]
  }
}

interface Fit { s: number; tx: number; ty: number }

/**
 * Models pick figure coordinates blind — sometimes a 10-unit triangle, sometimes
 * one that runs off the canvas. Fit the drawn geometry to the frame instead of
 * trusting the numbers. Text is positioned by the fit but never scaled by it,
 * so labels stay legible at any zoom.
 */
function computeFit(prims: Primitive[], W: number, H: number, top: number, bottom: number): Fit {
  // Braces and labelled arrows are drawn *beside* their segment at a fixed
  // on-screen size, so the fit can't see them in the bounding box. Reserve room
  // for them or the label lands outside the frame.
  const annotated = prims.some((p) => p.type === 'brace' || (p.type === 'arrow' && p.label))
  const extra = annotated ? 34 : 0
  const padX = 26 + extra
  const yTop = top + extra
  const xs: number[] = []
  const ys: number[] = []
  for (const p of prims) {
    // Label anchors are steered by the geometry, not the other way round.
    if (p.type === 'text') continue
    for (const [x, y] of primitiveExtent(p)) { xs.push(x); ys.push(y) }
  }
  if (xs.length === 0) return { s: 1, tx: 0, ty: 0 }
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const w = maxX - minX, h = maxY - minY
  const availW = W - padX * 2
  const availH = H - top - bottom - 14 - extra * 2
  const s = Math.min(w > 0 ? availW / w : Infinity, h > 0 ? availH / h : Infinity)
  // The scale is derived from the bounding box, so it is only ever "wrong" for a
  // degenerate figure; the clamp is a guard against those, not a size limit.
  const scale = Number.isFinite(s) && s > 0 ? Math.min(Math.max(s, 1e-4), 1e4) : 1
  // Center what's left over.
  const tx = padX + (availW - w * scale) / 2 - minX * scale
  const ty = yTop + (availH - h * scale) / 2 - minY * scale
  return { s: scale, tx, ty }
}

const mapPt = (f: Fit, x: number, y: number): Pt => [x * f.s + f.tx, y * f.s + f.ty]
const fmt = (n: number) => (Math.round(n * 10) / 10).toString()
const ptsAttr = (pts: Pt[]) => pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')

function unit(from: Pt, to: Pt): Pt {
  const dx = to[0] - from[0], dy = to[1] - from[1]
  const len = Math.hypot(dx, dy)
  return len > 0 ? [dx / len, dy / len] : [1, 0]
}

/** Nudge overlapping labels apart so a figure's callouts stay readable. */
function placeLabels(boxes: { x: number; y: number; w: number; h: number }[], W: number, H: number) {
  const placed: typeof boxes = []
  for (const b of boxes) {
    b.x = Math.min(Math.max(b.x, 2), Math.max(2, W - b.w - 2))
    b.y = Math.min(Math.max(b.y, b.h), H - 2)
    for (let guard = 0; guard < 8; guard++) {
      const hit = placed.find(
        (o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y - b.h < o.y && b.y > o.y - o.h,
      )
      if (!hit) break
      const shifted = hit.y + b.h + 3
      if (shifted > H - 2) break
      b.y = shifted
    }
    placed.push(b)
  }
}

const CAPTION_WRAP = 66
const CAPTION_LH = 17

const CAPTION_MAX_LINES = 4

/**
 * Wrap a caption to the frame width.
 *
 * The caption carries the punchline of the step — cutting it off mid-sentence
 * loses the very thing the frame exists to say. So it gets as many lines as it
 * needs (the caption bar grows to match), and in the pathological case the last
 * line is ellipsized so the truncation is at least visible rather than silent.
 */
function captionLines(caption: string, W: number): string[] {
  const max = Math.max(24, Math.round((W - 32) / 7))
  const lines = wrapLine(caption, Math.min(max, CAPTION_WRAP))
  if (lines.length <= CAPTION_MAX_LINES) return lines
  const kept = lines.slice(0, CAPTION_MAX_LINES)
  kept[CAPTION_MAX_LINES - 1] = kept[CAPTION_MAX_LINES - 1].replace(/\s*\S*$/, '') + '…'
  return kept
}

/** Perpendicular unit vector, rotated a quarter turn from a→b. */
function perp(a: Pt, b: Pt): Pt {
  const [ux, uy] = unit(a, b)
  return [-uy, ux]
}

const alpha = (p: { opacity?: number }) => (p.opacity === undefined ? '' : ` opacity="${p.opacity}"`)

/**
 * Draw the shapes of one frame. Markers whose job is annotation (right-angle
 * squares, arrowheads, braces) are built from post-fit coordinates so they keep
 * a constant on-screen size no matter how the figure was scaled.
 */
function renderShapes(prims: Primitive[], fit: Fit): string[] {
  const parts: string[] = []
  const stroke = (p: { color?: string }) => p.color || INK
  const dash = (on?: boolean) => (on ? ' stroke-dasharray="6 4"' : '')

  for (const p of prims) {
    switch (p.type) {
      case 'text':
        break // Labels are placed as a group, after the figure.
      case 'line': {
        const [x1, y1] = mapPt(fit, p.x1, p.y1)
        const [x2, y2] = mapPt(fit, p.x2, p.y2)
        parts.push(`<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${stroke(p)}" stroke-width="${p.width || 2}" stroke-linecap="round"${dash(p.dashed)}${alpha(p)}/>`)
        break
      }
      case 'circle': {
        const [cx, cy] = mapPt(fit, p.cx, p.cy)
        parts.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(p.r * fit.s)}" fill="${p.fill || 'none'}" stroke="${stroke(p)}" stroke-width="${p.width || 2}"${alpha(p)}/>`)
        break
      }
      case 'rect': {
        const [x, y] = mapPt(fit, p.x, p.y)
        parts.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(p.width * fit.s)}" height="${fmt(p.height * fit.s)}" fill="${p.fill || 'none'}" stroke="${stroke(p)}" stroke-width="2"${alpha(p)}/>`)
        break
      }
      case 'polygon': {
        const pts = p.points.map(([x, y]) => mapPt(fit, x, y))
        parts.push(`<polygon points="${ptsAttr(pts)}" fill="${p.fill || 'none'}" stroke="${stroke(p)}" stroke-width="${p.width || 2}" stroke-linejoin="round"${alpha(p)}/>`)
        break
      }
      case 'polyline': {
        const pts = p.points.map(([x, y]) => mapPt(fit, x, y))
        parts.push(`<polyline points="${ptsAttr(pts)}" fill="none" stroke="${stroke(p)}" stroke-width="${p.width || 2}" stroke-linejoin="round" stroke-linecap="round"${dash(p.dashed)}${alpha(p)}/>`)
        break
      }
      case 'rightangle': {
        const v = mapPt(fit, p.x, p.y)
        const ua = unit(v, mapPt(fit, p.ax, p.ay))
        const ub = unit(v, mapPt(fit, p.bx, p.by))
        const m = 14
        const a: Pt = [v[0] + ua[0] * m, v[1] + ua[1] * m]
        const b: Pt = [v[0] + ub[0] * m, v[1] + ub[1] * m]
        const corner: Pt = [v[0] + (ua[0] + ub[0]) * m, v[1] + (ua[1] + ub[1]) * m]
        parts.push(`<polyline points="${ptsAttr([a, corner, b])}" fill="none" stroke="${p.color || AXIS}" stroke-width="1.5"${alpha(p)}/>`)
        break
      }
      case 'arc': {
        const v = mapPt(fit, p.x, p.y)
        const ua = unit(v, mapPt(fit, p.ax, p.ay))
        const ub = unit(v, mapPt(fit, p.bx, p.by))
        const r = 24
        const a: Pt = [v[0] + ua[0] * r, v[1] + ua[1] * r]
        const b: Pt = [v[0] + ub[0] * r, v[1] + ub[1] * r]
        const sweep = ua[0] * ub[1] - ua[1] * ub[0] > 0 ? 1 : 0
        parts.push(`<path d="M ${fmt(a[0])} ${fmt(a[1])} A ${r} ${r} 0 0 ${sweep} ${fmt(b[0])} ${fmt(b[1])}" fill="none" stroke="${p.color || AXIS}" stroke-width="1.5"${alpha(p)}/>`)
        if (p.label) {
          const bis = unit([0, 0], [ua[0] + ub[0], ua[1] + ub[1]])
          parts.push(`<text x="${fmt(v[0] + bis[0] * (r + 12))}" y="${fmt(v[1] + bis[1] * (r + 12) + 4)}" font-size="12" text-anchor="middle" fill="${p.color || '#78716c'}"${alpha(p)}>${esc(p.label)}</text>`)
        }
        break
      }
      case 'arrow': {
        const a = mapPt(fit, p.x1, p.y1)
        const b = mapPt(fit, p.x2, p.y2)
        const u = unit(a, b)
        const n: Pt = [-u[1], u[0]]
        const head = 11
        const color = p.color || ACCENT
        // Stop the shaft short of the tip so it doesn't show through the head.
        const shaft: Pt = [b[0] - u[0] * head * 0.85, b[1] - u[1] * head * 0.85]
        parts.push(`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(shaft[0])}" y2="${fmt(shaft[1])}" stroke="${color}" stroke-width="${p.width || 2}" stroke-linecap="round"${dash(p.dashed)}${alpha(p)}/>`)
        const left: Pt = [b[0] - u[0] * head + n[0] * head * 0.42, b[1] - u[1] * head + n[1] * head * 0.42]
        const right: Pt = [b[0] - u[0] * head - n[0] * head * 0.42, b[1] - u[1] * head - n[1] * head * 0.42]
        parts.push(`<polygon points="${ptsAttr([b, left, right])}" fill="${color}"${alpha(p)}/>`)
        if (p.label) {
          const mid: Pt = [(a[0] + b[0]) / 2 + n[0] * 12, (a[1] + b[1]) / 2 + n[1] * 12]
          parts.push(`<text x="${fmt(mid[0])}" y="${fmt(mid[1] + 4)}" font-size="12" text-anchor="middle" fill="${color}"${alpha(p)}>${esc(p.label)}</text>`)
        }
        break
      }
      case 'brace': {
        const a = mapPt(fit, p.x1, p.y1)
        const b = mapPt(fit, p.x2, p.y2)
        const u = unit(a, b)
        const nRaw = perp(a, b)
        const n: Pt = p.flip ? [-nRaw[0], -nRaw[1]] : nRaw
        const d = 8
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        const shoulder = Math.max(0, len / 2 - d)
        const off = (pt: Pt, k: number): Pt => [pt[0] + n[0] * k, pt[1] + n[1] * k]
        const along = (t: number): Pt => [a[0] + u[0] * t, a[1] + u[1] * t]
        const c1 = off(along(shoulder), d)
        const c2 = off(along(len - shoulder), d)
        const mid = off(along(len / 2), d)
        const tip = off(along(len / 2), d * 2)
        const color = p.color || '#78716c'
        const d_ = `M ${fmt(a[0])} ${fmt(a[1])} Q ${fmt(off(a, d)[0])} ${fmt(off(a, d)[1])} ${fmt(c1[0])} ${fmt(c1[1])} Q ${fmt(mid[0])} ${fmt(mid[1])} ${fmt(tip[0])} ${fmt(tip[1])} Q ${fmt(mid[0])} ${fmt(mid[1])} ${fmt(c2[0])} ${fmt(c2[1])} Q ${fmt(off(b, d)[0])} ${fmt(off(b, d)[1])} ${fmt(b[0])} ${fmt(b[1])}`
        parts.push(`<path d="${d_}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"${alpha(p)}/>`)
        if (p.label) {
          const lp = off(along(len / 2), d * 2 + 13)
          parts.push(`<text x="${fmt(lp[0])}" y="${fmt(lp[1] + 4)}" font-size="13" text-anchor="middle" fill="${color}"${alpha(p)}>${esc(p.label)}</text>`)
        }
        break
      }
    }
  }
  return parts
}

/** Labels, placed as a group so they can be de-overlapped and kept in frame. */
function renderLabels(prims: Primitive[], fit: Fit, W: number, H: number): string[] {
  const texts = prims.filter((p): p is Extract<Primitive, { type: 'text' }> => p.type === 'text')
  const boxes = texts.map((t) => {
    const [x, y] = mapPt(fit, t.x, t.y)
    const size = t.size || 14
    const w = t.text.length * size * 0.58
    const left = t.anchor === 'middle' ? x - w / 2 : t.anchor === 'end' ? x - w : x
    return { x: left, y, w, h: size * 1.1 }
  })
  placeLabels(boxes, W, H)
  return texts.map((t, i) => {
    const size = t.size || 14
    const b = boxes[i]
    const x = t.anchor === 'middle' ? b.x + b.w / 2 : t.anchor === 'end' ? b.x + b.w : b.x
    const anchor = t.anchor && t.anchor !== 'start' ? ` text-anchor="${t.anchor}"` : ''
    const weight = t.bold ? ' font-weight="700"' : ''
    return `<text x="${fmt(x)}" y="${fmt(b.y)}" font-size="${size}" fill="${t.color || INK}"${anchor}${weight}${alpha(t)}>${esc(t.text)}</text>`
  })
}

interface FigureOpts {
  W: number
  H: number
  title?: string
  /** Drawn in this frame. */
  primitives: Primitive[]
  /** Every primitive across every frame — the figure is fitted to this, so the
   *  drawing holds still as steps are revealed. */
  fitTo: Primitive[]
  caption?: string
  step?: number
  total?: number
}

function buildFigureSvg(o: FigureOpts): string {
  const { W, H } = o
  const top = o.title ? 30 : 12
  const caps = o.caption ? captionLines(o.caption, W) : []
  const bottom = caps.length ? 16 + caps.length * CAPTION_LH : 12
  const fit = computeFit(o.fitTo, W, H, top, bottom)

  const parts = [
    ...renderShapes(o.primitives, fit),
    ...renderLabels(o.primitives, fit, W, H - bottom),
  ]

  if (o.title) parts.unshift(`<text x="12" y="18" font-size="14" font-weight="700" fill="${INK}">${esc(o.title)}</text>`)
  if (o.step && o.total && o.total > 1) {
    parts.push(`<text x="${W - 12}" y="18" font-size="12" text-anchor="end" fill="#a8a29e">${o.step} / ${o.total}</text>`)
  }
  if (caps.length) {
    const barY = H - bottom
    parts.push(`<line x1="0" y1="${barY}" x2="${W}" y2="${barY}" stroke="#f5f5f4" stroke-width="1"/>`)
    caps.forEach((line, i) => {
      parts.push(`<text x="${W / 2}" y="${barY + 20 + i * CAPTION_LH}" font-size="13" text-anchor="middle" fill="#44403c">${esc(line)}</text>`)
    })
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${parts.join('')}</svg>`
}

const frameSize = (w?: number, h?: number) => ({
  W: Math.min(Math.max(w || 480, 200), 900),
  H: Math.min(Math.max(h || 320, 160), 700),
})

function buildShapesFrames(s: ShapesItem): Frame[] {
  const { W, H } = frameSize(s.width, s.height)
  return [{ svg: buildFigureSvg({ W, H, title: s.title, primitives: s.primitives, fitTo: s.primitives }) }]
}

function buildSequenceFrames(q: SequenceItem): Frame[] {
  const { W, H } = frameSize(q.width, q.height)
  const all = q.steps.flatMap((st) => st.add)
  let shown: Primitive[] = []
  return q.steps.map((st, i) => {
    if (st.clear) shown = []
    shown.push(...st.add)
    return {
      caption: st.caption,
      svg: buildFigureSvg({
        W,
        H,
        title: q.title,
        primitives: [...shown],
        fitTo: all,
        caption: st.caption,
        step: i + 1,
        total: q.steps.length,
      }),
    }
  })
}

/** Every frame an item produces — one for most kinds, several for a sequence. */
export function buildItemFrames(item: DrawItem): Frame[] {
  if (item.kind === 'graph') return [{ svg: buildGraphSvg(item) }]
  if (item.kind === 'note') return [{ svg: buildNoteSvg(item) }]
  if (item.kind === 'sequence') return buildSequenceFrames(item)
  return buildShapesFrames(item)
}

/** The item as a single image (a sequence collapses to its finished frame). */
export function buildItemSvg(item: DrawItem): string {
  const frames = buildItemFrames(item)
  return frames[frames.length - 1].svg
}

/** Every frame in the spec, in order, flattened across items. */
export function buildSpecFrames(spec: DrawSpec): Frame[] {
  return spec.items.flatMap(buildItemFrames)
}

/** One SVG per frame, in order. */
export function buildSpecSvgs(spec: DrawSpec): string[] {
  return buildSpecFrames(spec).map((f) => f.svg)
}
