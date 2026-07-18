import { buildOverallTrend } from '@/lib/mastery-trend'

describe('buildOverallTrend', () => {
  it('returns empty for no history', () => {
    expect(buildOverallTrend([])).toEqual([])
  })

  it('tracks a single topic over time', () => {
    const h = [
      { topic: 'a', mastery: 0.2, createdAt: '2026-01-01T00:00:00Z' },
      { topic: 'a', mastery: 0.5, createdAt: '2026-01-02T00:00:00Z' },
    ]
    const t = buildOverallTrend(h)
    expect(t.map((p) => p.value)).toEqual([0.2, 0.5])
  })

  it('averages across topics using the latest value per topic', () => {
    const h = [
      { topic: 'a', mastery: 0.4, createdAt: '2026-01-01T00:00:00Z' },
      { topic: 'b', mastery: 0.6, createdAt: '2026-01-02T00:00:00Z' }, // avg (0.4,0.6)=0.5
      { topic: 'a', mastery: 0.8, createdAt: '2026-01-03T00:00:00Z' }, // avg (0.8,0.6)=0.7
    ]
    const t = buildOverallTrend(h)
    expect(t.map((p) => p.value)).toEqual([0.4, 0.5, 0.7])
  })

  it('sorts unordered input by time', () => {
    const h = [
      { topic: 'a', mastery: 0.9, createdAt: '2026-01-03T00:00:00Z' },
      { topic: 'a', mastery: 0.1, createdAt: '2026-01-01T00:00:00Z' },
    ]
    const t = buildOverallTrend(h)
    expect(t[0].value).toBe(0.1)
    expect(t[1].value).toBe(0.9)
  })

  it('downsamples to at most maxPoints (+ last)', () => {
    const h = Array.from({ length: 500 }, (_, i) => ({
      topic: 'a',
      mastery: i / 500,
      createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
    }))
    const t = buildOverallTrend(h, 100)
    expect(t.length).toBeLessThanOrEqual(101)
    expect(t[t.length - 1].value).toBeCloseTo(499 / 500)
  })
})
