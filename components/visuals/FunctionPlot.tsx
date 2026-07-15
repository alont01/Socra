'use client'

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { compileExpr, type CompiledExpr } from '@/lib/math-eval'

export interface PlotSeries {
  label?: string
  color?: string
  /** Explicit points [[x,y],...]. */
  points?: [number, number][]
  /** Expression y = f(x[, params]) — evaluated client-side at high resolution. */
  expr?: string
}

export interface PlotPoint {
  x: number
  y: number
  label?: string
}

export interface PlotParam {
  name: string
  min: number
  max: number
  step?: number
  value: number
}

export interface PlotSpec {
  title?: string
  xLabel?: string
  yLabel?: string
  xDomain?: [number, number]
  yDomain?: [number, number]
  series?: PlotSeries[]
  points?: PlotPoint[]
  /** Interactive parameters — rendered as sliders that re-plot live. */
  params?: PlotParam[]
}

const PALETTE = ['#f97316', '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#0891b2']

const VB_W = 440
const VB_H = 300
const M = { l: 44, r: 16, t: 30, b: 34 }
const PW = VB_W - M.l - M.r
const PH = VB_H - M.t - M.b
const SAMPLES = 240

function finitePair(p: unknown): p is [number, number] {
  return (
    Array.isArray(p) && p.length >= 2 &&
    typeof p[0] === 'number' && typeof p[1] === 'number' &&
    Number.isFinite(p[0]) && Number.isFinite(p[1])
  )
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min]
  const step0 = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(step0)))
  const norm = step0 / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.5; v += step) {
    ticks.push(Number(v.toFixed(10)))
  }
  return ticks
}

const fmt = (v: number): string => String(Number(v.toFixed(4)))

// Robust y-range: use 2nd–98th percentile of finite samples so asymptotes
// (tan, 1/x) don't blow up the scale.
function robustRange(ys: number[]): [number, number] {
  const f = ys.filter((y) => Number.isFinite(y)).sort((a, b) => a - b)
  if (f.length === 0) return [-1, 1]
  const lo = f[Math.floor((f.length - 1) * 0.02)]
  const hi = f[Math.ceil((f.length - 1) * 0.98)]
  if (lo === hi) return [lo - 1, hi + 1]
  return [lo, hi]
}

const domainOk = (d: unknown): d is [number, number] =>
  Array.isArray(d) && Number.isFinite(d[0]) && Number.isFinite(d[1]) && d[0] < d[1]

// Linear-interpolate y at x for an explicit points series.
function interp(points: [number, number][], x: number): number {
  if (points.length === 0) return NaN
  if (x <= points[0][0]) return points[0][1]
  const last = points[points.length - 1]
  if (x >= last[0]) return last[1]
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      const t = (x - x0) / (x1 - x0)
      return y0 + t * (y1 - y0)
    }
  }
  return last[1]
}

export function FunctionPlot({ spec }: { spec: PlotSpec }) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Interactive parameters (sliders).
  const specParams = useMemo(
    () => (Array.isArray(spec.params) ? spec.params.filter((p) => p && typeof p.name === 'string' && Number.isFinite(p.value)) : []),
    [spec.params],
  )
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const p of specParams) init[p.name] = p.value
    return init
  })

  const [hoverX, setHoverX] = useState<number | null>(null)

  // Compile expressions once (keyed on the expr strings).
  const compiled = useMemo(() => {
    const map = new Map<string, CompiledExpr | null>()
    for (const s of spec.series ?? []) {
      if (typeof s.expr === 'string' && !map.has(s.expr)) map.set(s.expr, compileExpr(s.expr))
    }
    return map
  }, [spec.series])

  const model = useMemo(() => {
    const rawSeries = spec.series ?? []

    // Determine x-domain first (needed to sample expr series).
    const explicitXs: number[] = []
    for (const s of rawSeries) {
      if (Array.isArray(s.points)) for (const p of s.points) if (finitePair(p)) explicitXs.push(p[0])
    }
    for (const p of spec.points ?? []) if (p && Number.isFinite(p.x)) explicitXs.push(p.x)

    let [xmin, xmax] = domainOk(spec.xDomain)
      ? spec.xDomain
      : explicitXs.length > 0
        ? [Math.min(...explicitXs), Math.max(...explicitXs)]
        : [-10, 10]
    if (!(xmin < xmax)) { xmin = -10; xmax = 10 }

    // Build each series' points (sampling expr, filtering points).
    const built = rawSeries
      .map((s, i) => {
        const color = s.color || PALETTE[i % PALETTE.length]
        let pts: [number, number][] = []
        const fn = typeof s.expr === 'string' ? compiled.get(s.expr) : null
        if (fn) {
          for (let k = 0; k <= SAMPLES; k++) {
            const x = xmin + ((xmax - xmin) * k) / SAMPLES
            const y = fn({ ...paramValues, x })
            pts.push([x, y])
          }
        } else if (Array.isArray(s.points)) {
          pts = s.points.filter(finitePair)
        }
        return { label: s.label, color, points: pts, expr: s.expr, fn: fn ?? null }
      })
      .filter((s) => s.points.length > 0)

    const markers = (spec.points ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))

    // y-range.
    const allYs = [...built.flatMap((s) => s.points.map((p) => p[1])), ...markers.map((p) => p.y)]
    let [ymin, ymax] = domainOk(spec.yDomain) ? spec.yDomain : robustRange(allYs)
    if (!(ymin < ymax)) { ymin = -1; ymax = 1 }
    if (!domainOk(spec.yDomain)) {
      const pad = (ymax - ymin) * 0.08
      ymin -= pad; ymax += pad
    }

    const sx = (x: number) => M.l + ((x - xmin) / (xmax - xmin)) * PW
    const sy = (y: number) => M.t + PH - ((y - ymin) / (ymax - ymin)) * PH
    const ySpan = ymax - ymin

    const paths = built.map((s) => {
      let d = ''
      let pen = false
      for (const [x, y] of s.points) {
        // Break the line on out-of-range jumps (asymptotes) instead of spiking.
        if (!Number.isFinite(y) || y < ymin - ySpan || y > ymax + ySpan) { pen = false; continue }
        d += pen ? `L ${sx(x).toFixed(2)} ${sy(y).toFixed(2)} ` : `M ${sx(x).toFixed(2)} ${sy(y).toFixed(2)} `
        pen = true
      }
      return { d: d.trim(), color: s.color, label: s.label }
    })

    // Primary series for hover readout: prefer the first expr series.
    const primary = built.find((s) => s.fn) ?? built[0] ?? null

    return {
      xmin, xmax, ymin, ymax, sx, sy, paths, markers, primary,
      xticks: niceTicks(xmin, xmax),
      yticks: niceTicks(ymin, ymax),
      legend: paths.filter((p) => p.label),
    }
  }, [spec, compiled, paramValues])

  const { xmin, xmax, ymin, ymax, sx, sy, paths, markers, primary, xticks, yticks, legend } = model
  const axisY0 = ymin <= 0 && ymax >= 0 ? sy(0) : null
  const axisX0 = xmin <= 0 && xmax >= 0 ? sx(0) : null

  // Hover readout.
  const hover = useMemo(() => {
    if (hoverX === null || !primary) return null
    const y = primary.fn ? primary.fn({ ...paramValues, x: hoverX }) : interp(primary.points, hoverX)
    if (!Number.isFinite(y) || y < ymin || y > ymax) return { x: hoverX, y: NaN }
    return { x: hoverX, y }
  }, [hoverX, primary, paramValues, ymin, ymax])

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const vbX = ((e.clientX - rect.left) / rect.width) * VB_W
    const dataX = xmin + ((vbX - M.l) / PW) * (xmax - xmin)
    if (dataX < xmin || dataX > xmax) { setHoverX(null); return }
    setHoverX(dataX)
  }

  return (
    <figure className="my-2 rounded-lg ring-1 ring-stone-900/5 bg-white p-2">
      {spec.title && <figcaption className="mb-1 text-center text-xs font-semibold text-stone-700">{spec.title}</figcaption>}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={spec.title || 'graph'}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverX(null)}
      >
        {/* gridlines + ticks */}
        {xticks.map((t, i) => (
          <g key={`x${i}`}>
            <line x1={sx(t)} y1={M.t} x2={sx(t)} y2={M.t + PH} stroke="#f1ede6" strokeWidth={1} />
            <text x={sx(t)} y={M.t + PH + 14} textAnchor="middle" fontSize={9} fill="#a8a29e">{fmt(t)}</text>
          </g>
        ))}
        {yticks.map((t, i) => (
          <g key={`y${i}`}>
            <line x1={M.l} y1={sy(t)} x2={M.l + PW} y2={sy(t)} stroke="#f1ede6" strokeWidth={1} />
            <text x={M.l - 5} y={sy(t) + 3} textAnchor="end" fontSize={9} fill="#a8a29e">{fmt(t)}</text>
          </g>
        ))}

        {/* axes */}
        {axisY0 !== null && <line x1={M.l} y1={axisY0} x2={M.l + PW} y2={axisY0} stroke="#78716c" strokeWidth={1.2} />}
        {axisX0 !== null && <line x1={axisX0} y1={M.t} x2={axisX0} y2={M.t + PH} stroke="#78716c" strokeWidth={1.2} />}
        <rect x={M.l} y={M.t} width={PW} height={PH} fill="none" stroke="#e7e1d8" strokeWidth={1} />

        {/* curves */}
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* labeled markers */}
        {markers.map((p, i) => (
          <g key={`m${i}`}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={3} fill="#1c1917" />
            {p.label && <text x={sx(p.x) + 5} y={sy(p.y) - 5} fontSize={9} fill="#1c1917">{p.label}</text>}
          </g>
        ))}

        {/* hover crosshair + readout */}
        {hover && (
          <g pointerEvents="none">
            <line x1={sx(hover.x)} y1={M.t} x2={sx(hover.x)} y2={M.t + PH} stroke="#f97316" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
            {Number.isFinite(hover.y) && <circle cx={sx(hover.x)} cy={sy(hover.y)} r={3.5} fill="#f97316" stroke="#fff" strokeWidth={1} />}
            <g transform={`translate(${Math.min(sx(hover.x) + 6, VB_W - 92)}, ${M.t + 4})`}>
              <rect width={86} height={16} rx={4} fill="#1c1917" opacity={0.85} />
              <text x={43} y={11} textAnchor="middle" fontSize={9} fill="#fff">
                ({fmt(hover.x)}, {Number.isFinite(hover.y) ? fmt(hover.y) : '—'})
              </text>
            </g>
          </g>
        )}

        {/* axis labels */}
        {spec.xLabel && <text x={M.l + PW / 2} y={VB_H - 2} textAnchor="middle" fontSize={10} fill="#57534e">{spec.xLabel}</text>}
        {spec.yLabel && <text x={10} y={M.t + PH / 2} textAnchor="middle" fontSize={10} fill="#57534e" transform={`rotate(-90 10 ${M.t + PH / 2})`}>{spec.yLabel}</text>}
      </svg>

      {/* parameter sliders */}
      {specParams.length > 0 && (
        <div className="mt-2 space-y-1.5 px-1">
          {specParams.map((p) => {
            const val = paramValues[p.name] ?? p.value
            const step = p.step && p.step > 0 ? p.step : (p.max - p.min) / 100 || 0.1
            return (
              <div key={p.name} className="flex items-center gap-2">
                <label htmlFor={`param-${p.name}`} className="text-xs font-mono text-stone-600 w-14 shrink-0">
                  {p.name} = {Number(val.toFixed(2))}
                </label>
                <input
                  id={`param-${p.name}`}
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={step}
                  value={val}
                  onChange={(e) => setParamValues((prev) => ({ ...prev, [p.name]: Number(e.target.value) }))}
                  className="flex-1 accent-orange-500"
                  aria-label={`Parameter ${p.name}`}
                />
              </div>
            )
          })}
        </div>
      )}

      {legend.length > 1 && (
        <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
          {legend.map((p, i) => (
            <span key={i} className="flex items-center gap-1 text-[10px] text-stone-600">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: p.color }} />
              {p.label}
            </span>
          ))}
        </div>
      )}
    </figure>
  )
}
