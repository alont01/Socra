'use client'

import { useMemo } from 'react'

export interface PlotSeries {
  label?: string
  color?: string
  points: [number, number][]
}

export interface PlotPoint {
  x: number
  y: number
  label?: string
}

export interface PlotSpec {
  title?: string
  xLabel?: string
  yLabel?: string
  xDomain?: [number, number]
  yDomain?: [number, number]
  series?: PlotSeries[]
  points?: PlotPoint[]
}

const PALETTE = ['#f97316', '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#0891b2']

const VB_W = 440
const VB_H = 300
const M = { l: 44, r: 16, t: 30, b: 34 }
const PW = VB_W - M.l - M.r
const PH = VB_H - M.t - M.b

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

function fmt(v: number): string {
  return String(Number(v.toFixed(4)))
}

export function FunctionPlot({ spec }: { spec: PlotSpec }) {
  const model = useMemo(() => {
    const series = (spec.series ?? [])
      .map((s) => ({
        label: typeof s.label === 'string' ? s.label : undefined,
        color: typeof s.color === 'string' ? s.color : undefined,
        points: Array.isArray(s.points) ? s.points.filter(finitePair) : [],
      }))
      .filter((s) => s.points.length > 0)

    const markers = (spec.points ?? []).filter(
      (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y),
    )

    const xs = [...series.flatMap((s) => s.points.map((p) => p[0])), ...markers.map((p) => p.x)]
    const ys = [...series.flatMap((s) => s.points.map((p) => p[1])), ...markers.map((p) => p.y)]

    const domainOk = (d: unknown): d is [number, number] =>
      Array.isArray(d) && Number.isFinite(d[0]) && Number.isFinite(d[1]) && d[0] < d[1]

    let [xmin, xmax] = domainOk(spec.xDomain) ? spec.xDomain : [Math.min(...xs), Math.max(...xs)]
    let [ymin, ymax] = domainOk(spec.yDomain) ? spec.yDomain : [Math.min(...ys), Math.max(...ys)]

    if (!Number.isFinite(xmin) || !Number.isFinite(xmax) || xmin === xmax) { xmin = -10; xmax = 10 }
    if (!Number.isFinite(ymin) || !Number.isFinite(ymax) || ymin === ymax) {
      const pad = Number.isFinite(ymin) ? Math.abs(ymin) || 1 : 1
      ymin -= pad; ymax += pad
    } else if (!domainOk(spec.yDomain)) {
      const pad = (ymax - ymin) * 0.08
      ymin -= pad; ymax += pad
    }

    const sx = (x: number) => M.l + ((x - xmin) / (xmax - xmin)) * PW
    const sy = (y: number) => M.t + PH - ((y - ymin) / (ymax - ymin)) * PH
    const ySpan = ymax - ymin

    const paths = series.map((s, i) => {
      const color = s.color || PALETTE[i % PALETTE.length]
      let d = ''
      let pen = false
      for (const [x, y] of s.points) {
        // Break the line on out-of-range jumps (asymptotes) instead of spiking.
        if (y < ymin - ySpan || y > ymax + ySpan) { pen = false; continue }
        const px = sx(x).toFixed(2)
        const py = sy(y).toFixed(2)
        d += pen ? `L ${px} ${py} ` : `M ${px} ${py} `
        pen = true
      }
      return { d: d.trim(), color, label: s.label }
    })

    return {
      xmin, xmax, ymin, ymax, sx, sy, paths, markers,
      xticks: niceTicks(xmin, xmax),
      yticks: niceTicks(ymin, ymax),
      legend: paths.filter((p) => p.label),
    }
  }, [spec])

  const { xmin, xmax, ymin, ymax, sx, sy, paths, markers, xticks, yticks, legend } = model
  const axisY0 = ymin <= 0 && ymax >= 0 ? sy(0) : null
  const axisX0 = xmin <= 0 && xmax >= 0 ? sx(0) : null

  return (
    <div className="my-2 rounded-lg border border-orange-100 bg-white p-2">
      {spec.title && <div className="mb-1 text-center text-xs font-semibold text-stone-700">{spec.title}</div>}
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-auto w-full" role="img" aria-label={spec.title || 'graph'}>
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

        {/* labeled points */}
        {markers.map((p, i) => (
          <g key={`m${i}`}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={3} fill="#1c1917" />
            {p.label && <text x={sx(p.x) + 5} y={sy(p.y) - 5} fontSize={9} fill="#1c1917">{p.label}</text>}
          </g>
        ))}

        {/* axis labels */}
        {spec.xLabel && <text x={M.l + PW / 2} y={VB_H - 2} textAnchor="middle" fontSize={10} fill="#57534e">{spec.xLabel}</text>}
        {spec.yLabel && <text x={10} y={M.t + PH / 2} textAnchor="middle" fontSize={10} fill="#57534e" transform={`rotate(-90 10 ${M.t + PH / 2})`}>{spec.yLabel}</text>}
      </svg>

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
    </div>
  )
}
