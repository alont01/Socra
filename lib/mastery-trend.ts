// Reconstruct an "overall average mastery over time" series from the raw
// per-topic mastery snapshots. Each snapshot records one topic's new mastery at
// a point in time; we replay them in order, keeping the latest value per topic,
// and emit the running average after each change.

export interface MasterySnapshot {
  topic: string
  mastery: number
  createdAt: string
}

export interface TrendPoint {
  t: string // ISO timestamp
  value: number // 0..1 average mastery
}

function downsample(points: TrendPoint[], max: number): TrendPoint[] {
  if (points.length <= max) return points
  const step = points.length / max
  const out: TrendPoint[] = []
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)])
  const last = points[points.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

export function buildOverallTrend(history: MasterySnapshot[], maxPoints = 120): TrendPoint[] {
  const rows = [...history].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
  const latest = new Map<string, number>()
  const out: TrendPoint[] = []
  for (const r of rows) {
    if (!Number.isFinite(r.mastery)) continue
    latest.set(r.topic, r.mastery)
    let sum = 0
    for (const v of latest.values()) sum += v
    out.push({ t: r.createdAt, value: sum / latest.size })
  }
  return downsample(out, maxPoints)
}
