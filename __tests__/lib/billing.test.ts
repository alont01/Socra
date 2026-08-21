import { sessionHours, billableHours, aggregateBilling, monthBounds, type SessionHoursRow } from '@/lib/billing'

const at = (iso: string) => new Date(iso)
const START = at('2026-01-01T15:00:00Z')
/** `START` plus n minutes. */
const plus = (minutes: number) => new Date(START.getTime() + minutes * 60_000)

describe('sessionHours', () => {
  it('converts a duration to hours', () => {
    expect(sessionHours(START, at('2026-01-01T16:00:00Z'))).toBe(1)
    expect(sessionHours(START, at('2026-01-01T15:30:00Z'))).toBe(0.5)
  })

  it('never returns negative (bad/reversed timestamps)', () => {
    expect(sessionHours(at('2026-01-01T16:00:00Z'), START)).toBe(0)
  })

  it('returns 0 for an invalid date rather than NaN', () => {
    expect(sessionHours(START, new Date('nonsense'))).toBe(0)
  })
})

describe('billableHours', () => {
  // Grace defaults to 10 minutes (config.billing.graceMinutes).

  it('bills the full time when a session runs exactly as scheduled', () => {
    expect(billableHours(START, plus(120), 120)).toBe(2)
    expect(billableHours(START, plus(60), 60)).toBe(1)
  })

  it('bills actual time when a session runs short', () => {
    // Scheduled 2h, student left after 40 min → 40 min.
    expect(billableHours(START, plus(40), 120)).toBeCloseTo(40 / 60, 10)
  })

  it('allows a small natural overrun within the grace window', () => {
    // Scheduled 60, ran 68 → billed 68 (inside the 10-minute grace).
    expect(billableHours(START, plus(68), 60)).toBeCloseTo(68 / 60, 10)
  })

  it('caps a session left open long past its scheduled end', () => {
    // The forgot-to-click-End case: scheduled 60, "ran" 3h → capped at 70 min.
    expect(billableHours(START, plus(180), 60)).toBeCloseTo(70 / 60, 10)
  })

  it('caps proportionally for a longer scheduled session', () => {
    // Scheduled 120, left open 5h → capped at 130 min, not 60.
    expect(billableHours(START, plus(300), 120)).toBeCloseTo(130 / 60, 10)
  })

  it('falls back to the default length when scheduledMinutes is missing or absurd', () => {
    // A bad row must not disable the cap and bill unbounded.
    expect(billableHours(START, plus(600), 0)).toBeCloseTo(70 / 60, 10)
    expect(billableHours(START, plus(600), -30)).toBeCloseTo(70 / 60, 10)
    expect(billableHours(START, plus(600), NaN)).toBeCloseTo(70 / 60, 10)
  })

  it('honours an explicit grace of zero', () => {
    expect(billableHours(START, plus(180), 60, 0)).toBe(1)
  })

  it('never returns negative for reversed timestamps', () => {
    expect(billableHours(plus(60), START, 60)).toBe(0)
  })
})

describe('aggregateBilling', () => {
  const row = (over: Partial<SessionHoursRow>): SessionHoursRow => ({
    parentId: 'p1', parentName: 'Parent One', parentEmail: 'p1@example.com',
    studentId: 's1', studentName: 'Student One',
    startedAt: new Date('2026-01-01T15:00:00Z'), endedAt: new Date('2026-01-01T16:00:00Z'),
    // Generous by default so these cases exercise aggregation, not the cap;
    // the cap has its own describe block above.
    scheduledMinutes: 480,
    autoClosed: false,
    ...over,
  })

  it('sums hours per child and per parent at the given rate', () => {
    const rows = [
      row({}), // 1 hr
      row({ startedAt: new Date('2026-01-08T15:00:00Z'), endedAt: new Date('2026-01-08T16:00:00Z') }), // 1 hr, same child
    ]
    const [billing] = aggregateBilling(rows, 75)
    expect(billing.parentId).toBe('p1')
    expect(billing.totalHours).toBe(2)
    expect(billing.amountCents).toBe(15000) // 2 * 75 * 100
    expect(billing.children).toEqual([{ studentId: 's1', studentName: 'Student One', hours: 2 }])
  })

  it('breaks out multiple children under the same parent', () => {
    const rows = [
      row({ studentId: 's1', studentName: 'Kid A' }),
      row({ studentId: 's2', studentName: 'Kid B', startedAt: new Date('2026-01-02T15:00:00Z'), endedAt: new Date('2026-01-02T17:00:00Z') }), // 2 hrs
    ]
    const [billing] = aggregateBilling(rows, 75)
    expect(billing.totalHours).toBe(3)
    expect(billing.children).toHaveLength(2)
  })

  it('separates different parents', () => {
    const rows = [row({ parentId: 'p1' }), row({ parentId: 'p2', parentName: 'Parent Two', parentEmail: 'p2@example.com' })]
    const result = aggregateBilling(rows, 75)
    expect(result).toHaveLength(2)
  })

  it('skips zero/negative-duration sessions', () => {
    const rows = [row({ startedAt: new Date('2026-01-01T16:00:00Z'), endedAt: new Date('2026-01-01T15:00:00Z') })]
    expect(aggregateBilling(rows, 75)).toEqual([])
  })

  it('rounds hours to 2 decimal places and keeps the amount consistent', () => {
    const rows = [row({ startedAt: new Date('2026-01-01T15:00:00Z'), endedAt: new Date('2026-01-01T15:20:00Z') })] // 1/3 hr
    const [billing] = aggregateBilling(rows, 75)
    expect(billing.totalHours).toBe(0.33)
    expect(billing.amountCents).toBe(Math.round(0.33 * 75 * 100))
  })

  it('sorts by total hours descending', () => {
    const rows = [
      row({ parentId: 'p1', startedAt: new Date('2026-01-01T15:00:00Z'), endedAt: new Date('2026-01-01T16:00:00Z') }), // 1hr
      row({ parentId: 'p2', parentName: 'P2', parentEmail: 'p2@x.com', startedAt: new Date('2026-01-01T15:00:00Z'), endedAt: new Date('2026-01-01T18:00:00Z') }), // 3hr
    ]
    const result = aggregateBilling(rows, 75)
    expect(result[0].parentId).toBe('p2')
    expect(result[1].parentId).toBe('p1')
  })

  it('returns [] for no rows', () => {
    expect(aggregateBilling([], 75)).toEqual([])
  })

  it('applies the per-session cap before summing', () => {
    const rows = [
      // Scheduled 60, left open 4h — must contribute 70 min, not 240.
      row({ scheduledMinutes: 60, startedAt: new Date('2026-01-01T15:00:00Z'), endedAt: new Date('2026-01-01T19:00:00Z') }),
      // A normal 1h session.
      row({ scheduledMinutes: 60, startedAt: new Date('2026-01-02T15:00:00Z'), endedAt: new Date('2026-01-02T16:00:00Z') }),
    ]
    const [billing] = aggregateBilling(rows, 75)
    expect(billing.totalHours).toBe(2.17) // 70min + 60min = 130min
    expect(billing.amountCents).toBe(Math.round(2.17 * 75 * 100))
  })
})

describe('monthBounds', () => {
  it('returns the first-of-month to first-of-next-month range in UTC', () => {
    const { start, end } = monthBounds(new Date('2026-08-15T12:00:00Z'))
    expect(start.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('handles December correctly (year rollover)', () => {
    const { start, end } = monthBounds(new Date('2026-12-10T00:00:00Z'))
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})
