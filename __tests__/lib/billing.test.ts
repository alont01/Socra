import { sessionHours, aggregateBilling, monthBounds, type SessionHoursRow } from '@/lib/billing'

describe('sessionHours', () => {
  it('converts a duration to hours', () => {
    expect(sessionHours(new Date('2026-01-01T15:00:00Z'), new Date('2026-01-01T16:00:00Z'))).toBe(1)
    expect(sessionHours(new Date('2026-01-01T15:00:00Z'), new Date('2026-01-01T15:30:00Z'))).toBe(0.5)
  })

  it('never returns negative (bad/reversed timestamps)', () => {
    expect(sessionHours(new Date('2026-01-01T16:00:00Z'), new Date('2026-01-01T15:00:00Z'))).toBe(0)
  })
})

describe('aggregateBilling', () => {
  const row = (over: Partial<SessionHoursRow>): SessionHoursRow => ({
    parentId: 'p1', parentName: 'Parent One', parentEmail: 'p1@example.com',
    studentId: 's1', studentName: 'Student One',
    startedAt: new Date('2026-01-01T15:00:00Z'), endedAt: new Date('2026-01-01T16:00:00Z'),
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
