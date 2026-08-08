// Weekly recurring availability + overlap math for tutor↔student matching.
//
// A person's availability is a list of weekly blocks. Times are local
// wall-clock (America/New_York assumed for v1) — matching is relative, so a
// single shared timezone keeps it correct without tz conversion.

export interface AvailabilityBlock {
  day: number // 0 = Sunday … 6 = Saturday
  start: string // "HH:MM" 24h
  end: string // "HH:MM" 24h, exclusive; must be after start
}

export interface OverlapSlot {
  day: number
  start: string
  end: string
  minutes: number
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function toMinutes(hhmm: string): number {
  const m = TIME_RE.exec(hhmm)
  if (!m) return NaN
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

export function fromMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** A single block is valid if the day and times parse and end is after start. */
export function isValidBlock(b: unknown): b is AvailabilityBlock {
  if (!b || typeof b !== 'object') return false
  const x = b as Record<string, unknown>
  if (typeof x.day !== 'number' || !Number.isInteger(x.day) || x.day < 0 || x.day > 6) return false
  if (typeof x.start !== 'string' || typeof x.end !== 'string') return false
  const s = toMinutes(x.start)
  const e = toMinutes(x.end)
  return Number.isFinite(s) && Number.isFinite(e) && e > s
}

/** Parse a JSON string (or array) of blocks, dropping anything malformed. */
export function parseBlocks(raw: unknown): AvailabilityBlock[] {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr.filter(isValidBlock).map((b) => ({ day: b.day, start: b.start, end: b.end }))
}

/**
 * Concrete shared windows between two availabilities where both are free for at
 * least `sessionMin` minutes on the same day. Each result is the trimmed
 * intersection (a window a session could be scheduled within).
 */
export function overlap(
  a: AvailabilityBlock[],
  b: AvailabilityBlock[],
  sessionMin = 60,
): OverlapSlot[] {
  const out: OverlapSlot[] = []
  for (const x of a) {
    const xs = toMinutes(x.start)
    const xe = toMinutes(x.end)
    for (const y of b) {
      if (y.day !== x.day) continue
      const start = Math.max(xs, toMinutes(y.start))
      const end = Math.min(xe, toMinutes(y.end))
      const minutes = end - start
      if (minutes >= sessionMin) {
        out.push({ day: x.day, start: fromMinutes(start), end: fromMinutes(end), minutes })
      }
    }
  }
  return out.sort((p, q) => p.day - q.day || toMinutes(p.start) - toMinutes(q.start))
}

/** Total overlapping minutes across all shared slots — the overlap "quality". */
export function overlapMinutes(slots: OverlapSlot[]): number {
  return slots.reduce((sum, s) => sum + s.minutes, 0)
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Human-readable slot, e.g. "Mon 3:00–4:00 PM". */
export function formatSlot(s: { day: number; start: string; end: string }): string {
  const h12 = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    const ap = h < 12 ? 'AM' : 'PM'
    const hr = h % 12 === 0 ? 12 : h % 12
    return `${hr}:${String(m).padStart(2, '0')} ${ap}`
  }
  return `${DAY_LABELS[s.day]} ${h12(s.start)}–${h12(s.end)}`
}
