import { parseBlocks, overlap, overlapMinutes, isValidBlock, formatSlot, toMinutes } from '@/lib/availability'

describe('availability', () => {
  describe('isValidBlock', () => {
    it('accepts a well-formed block', () => {
      expect(isValidBlock({ day: 1, start: '15:00', end: '18:00' })).toBe(true)
    })
    it('rejects end <= start', () => {
      expect(isValidBlock({ day: 1, start: '18:00', end: '15:00' })).toBe(false)
      expect(isValidBlock({ day: 1, start: '15:00', end: '15:00' })).toBe(false)
    })
    it('rejects bad day or time', () => {
      expect(isValidBlock({ day: 7, start: '15:00', end: '16:00' })).toBe(false)
      expect(isValidBlock({ day: 1, start: '25:00', end: '26:00' })).toBe(false)
      expect(isValidBlock({ day: 1, start: 'noon', end: '1pm' })).toBe(false)
    })
  })

  describe('parseBlocks', () => {
    it('parses a JSON string and drops malformed entries', () => {
      const raw = JSON.stringify([
        { day: 1, start: '15:00', end: '17:00' },
        { day: 9, start: '00:00', end: '01:00' }, // bad day
        { day: 2, start: '10:00', end: '09:00' }, // inverted
      ])
      expect(parseBlocks(raw)).toEqual([{ day: 1, start: '15:00', end: '17:00' }])
    })
    it('returns [] for invalid JSON or non-arrays', () => {
      expect(parseBlocks('not json')).toEqual([])
      expect(parseBlocks('{}')).toEqual([])
      expect(parseBlocks(null)).toEqual([])
    })
  })

  describe('overlap', () => {
    const tutor = [
      { day: 1, start: '15:00', end: '18:00' }, // Mon 3–6
      { day: 3, start: '16:00', end: '19:00' }, // Wed 4–7
    ]
    it('finds a shared window of at least the session length', () => {
      const student = [{ day: 1, start: '16:00', end: '17:30' }] // Mon 4–5:30
      const slots = overlap(tutor, student, 60)
      expect(slots).toEqual([{ day: 1, start: '16:00', end: '17:30', minutes: 90 }])
    })
    it('excludes overlaps shorter than the session length', () => {
      const student = [{ day: 1, start: '17:30', end: '18:00' }] // only 30 min
      expect(overlap(tutor, student, 60)).toEqual([])
    })
    it('ignores different days', () => {
      const student = [{ day: 2, start: '15:00', end: '18:00' }] // Tue
      expect(overlap(tutor, student, 60)).toEqual([])
    })
    it('returns multiple slots across days, sorted', () => {
      const student = [
        { day: 3, start: '17:00', end: '19:00' },
        { day: 1, start: '15:00', end: '16:30' },
      ]
      const slots = overlap(tutor, student, 60)
      expect(slots.map((s) => s.day)).toEqual([1, 3])
    })
  })

  it('overlapMinutes sums slot durations', () => {
    expect(
      overlapMinutes([
        { day: 1, start: '15:00', end: '16:00', minutes: 60 },
        { day: 3, start: '16:00', end: '17:30', minutes: 90 },
      ]),
    ).toBe(150)
  })

  it('formatSlot renders a friendly 12h label', () => {
    expect(formatSlot({ day: 1, start: '15:00', end: '16:00' })).toBe('Mon 3:00 PM–4:00 PM')
    expect(formatSlot({ day: 0, start: '09:30', end: '10:30' })).toBe('Sun 9:30 AM–10:30 AM')
  })

  it('toMinutes parses HH:MM', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes('15:30')).toBe(930)
    expect(Number.isNaN(toMinutes('bad'))).toBe(true)
  })
})
