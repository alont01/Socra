'use client'

import { useMemo } from 'react'

export interface TrendPoint { t: string; value: number }

const VB_W = 600
const VB_H = 200
const M = { l: 34, r: 12, t: 12, b: 22 }
const PW = VB_W - M.l - M.r
const PH = VB_H - M.t - M.b

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Overall mastery-over-time area chart. Points are spaced evenly by order (not
 * by real time gaps), which reads cleanly for a "sessions" progression, with
 * date labels at the ends. y is fixed to 0–100%.
 */
export function MasteryTrend({ points }: { points: TrendPoint[] }) {
  const model = useMemo(() => {
    const pts = (points ?? []).filter((p) => Number.isFinite(p.value))
    if (pts.length < 2) return null

    const n = pts.length
    const sx = (i: number) => M.l + (i / (n - 1)) * PW
    const sy = (v: number) => M.t + PH - Math.max(0, Math.min(1, v)) * PH

    let line = ''
    pts.forEach((p, i) => {
      line += `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(p.value).toFixed(1)} `
    })
    const area = `${line}L ${sx(n - 1).toFixed(1)} ${(M.t + PH).toFixed(1)} L ${sx(0).toFixed(1)} ${(M.t + PH).toFixed(1)} Z`

    const first = pts[0].value
    const last = pts[n - 1].value
    return { pts, sx, sy, line: line.trim(), area, first, last, n }
  }, [points])

  if (!model) {
    return (
      <div className="rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-6 text-center">
        <p className="text-sm text-stone-500">Your progress trend will appear here after a couple of sessions.</p>
      </div>
    )
  }

  const { pts, sx, sy, line, area, first, last, n } = model
  const curPct = Math.round(last * 100)
  const deltaPct = Math.round((last - first) * 100)
  const ticks = [0, 0.5, 1]

  return (
    <div className="rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="font-semibold text-stone-900">Overall mastery over time</h3>
          <p className="text-sm text-stone-500 mt-0.5">Across all your topics</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-stone-900 tabular-nums leading-none">{curPct}%</div>
          <div className={`text-xs font-medium mt-1 ${deltaPct >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
            {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}% since you started
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-auto w-full" role="img" aria-label={`Overall mastery ${curPct} percent, ${deltaPct >= 0 ? 'up' : 'down'} ${Math.abs(deltaPct)} percent since starting`}>
        <defs>
          <linearGradient id="masteryFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* y gridlines + labels */}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} y1={sy(v)} x2={M.l + PW} y2={sy(v)} stroke="#f1ede6" strokeWidth={1} />
            <text x={M.l - 6} y={sy(v) + 3} textAnchor="end" fontSize={9} fill="#a8a29e">{Math.round(v * 100)}%</text>
          </g>
        ))}

        {/* area + line */}
        <path d={area} fill="url(#masteryFill)" />
        <path d={line} fill="none" stroke="#f97316" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {/* endpoint dot */}
        <circle cx={sx(n - 1)} cy={sy(last)} r={3.5} fill="#f97316" stroke="#fff" strokeWidth={1.5} />

        {/* date labels at the ends */}
        <text x={M.l} y={VB_H - 6} textAnchor="start" fontSize={9} fill="#a8a29e">{fmtDate(pts[0].t)}</text>
        <text x={M.l + PW} y={VB_H - 6} textAnchor="end" fontSize={9} fill="#a8a29e">{fmtDate(pts[n - 1].t)}</text>
      </svg>
    </div>
  )
}
