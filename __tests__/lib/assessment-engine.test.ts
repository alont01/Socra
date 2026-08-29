import {
  initialLevel,
  nextLevel,
  shouldStop,
  resolveOutcome,
  finalCorrectFromOutcome,
  levelToMastery,
} from '@/lib/assessment-engine'

describe('initialLevel', () => {
  it('defaults to the mid-point (5) with no mastery data', () => {
    expect(initialLevel([], 'Geometry')).toBe(5)
  })

  it('maps existing mastery onto the 1-10 ladder for a matching topic', () => {
    expect(initialLevel([{ topic: 'Geometry', mastery: 0 }], 'Geometry')).toBe(1)
    expect(initialLevel([{ topic: 'Geometry', mastery: 1 }], 'Geometry')).toBe(10)
    expect(initialLevel([{ topic: 'Geometry', mastery: 0.5 }], 'Geometry')).toBe(6) // round(1+4.5)
  })

  it('matches loosely (substring, case-insensitive)', () => {
    expect(initialLevel([{ topic: 'geometry basics', mastery: 0.8 }], 'Geometry')).toBe(8)
  })

  it('falls back to default when no topic matches', () => {
    expect(initialLevel([{ topic: 'Algebra', mastery: 0.9 }], 'Geometry')).toBe(5)
  })

  it('prefers an exact topic match over substring matches', () => {
    const mastery = [
      { topic: 'Adding Fractions', mastery: 0.1 },
      { topic: 'Fractions', mastery: 1 },
      { topic: 'Dividing Fractions', mastery: 0.1 },
    ]
    expect(initialLevel(mastery, 'Fractions')).toBe(10)
  })

  // Picking the first of several substring hits made the starting difficulty a
  // function of row order. An ambiguous match tells us nothing, so it has to
  // fall back to the neutral mid-point rather than guess.
  it('falls back to default when several topics match ambiguously', () => {
    const mastery = [
      { topic: 'Adding Fractions', mastery: 0 },
      { topic: 'Dividing Fractions', mastery: 1 },
    ]
    expect(initialLevel(mastery, 'Fractions')).toBe(5)
  })

  it('is not swayed by row order when the match is ambiguous', () => {
    const a = [
      { topic: 'Pre-Algebra', mastery: 0 },
      { topic: 'Algebra II', mastery: 1 },
    ]
    expect(initialLevel(a, 'Algebra')).toBe(initialLevel([...a].reverse(), 'Algebra'))
  })
})

describe('nextLevel', () => {
  it('increases on correct, clamped at 10', () => {
    expect(nextLevel(5, 'correct')).toBe(6)
    expect(nextLevel(10, 'correct')).toBe(10)
  })

  it('decreases on incorrect, clamped at 1', () => {
    expect(nextLevel(5, 'incorrect')).toBe(4)
    expect(nextLevel(1, 'incorrect')).toBe(1)
  })

  it('holds position on worked_together', () => {
    expect(nextLevel(5, 'worked_together')).toBe(5)
  })
})

describe('shouldStop', () => {
  it('stops at the max item count regardless of convergence', () => {
    expect(shouldStop([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10)).toBe(true)
  })

  it('does not stop before the convergence window is reached', () => {
    expect(shouldStop([5, 6], 2)).toBe(false)
  })

  it('stops early when the last 3 levels settle within range 1', () => {
    expect(shouldStop([2, 4, 6, 7, 6], 5)).toBe(true) // last 3: 6,7,6 -> range 1
  })

  it('keeps going while levels are still swinging', () => {
    expect(shouldStop([5, 7, 3, 8, 2], 5)).toBe(false) // last 3: 3,8,2 -> range 6
  })
})

describe('resolveOutcome', () => {
  it('prefers a tutor override over the auto-grade', () => {
    expect(resolveOutcome(true, 'incorrect')).toBe('incorrect')
    expect(resolveOutcome(false, 'correct')).toBe('correct')
    expect(resolveOutcome(true, 'worked_together')).toBe('worked_together')
  })

  it('falls back to the auto-grade when there is no override', () => {
    expect(resolveOutcome(true, null)).toBe('correct')
    expect(resolveOutcome(false, null)).toBe('incorrect')
  })

  it('is null when nothing has graded it yet', () => {
    expect(resolveOutcome(null, null)).toBeNull()
  })
})

describe('finalCorrectFromOutcome', () => {
  it('maps correct/incorrect to true/false', () => {
    expect(finalCorrectFromOutcome('correct')).toBe(true)
    expect(finalCorrectFromOutcome('incorrect')).toBe(false)
  })
  it('maps worked_together and null to null (ambiguous / ungraded)', () => {
    expect(finalCorrectFromOutcome('worked_together')).toBeNull()
    expect(finalCorrectFromOutcome(null)).toBeNull()
  })
})

describe('levelToMastery', () => {
  it('maps the 1-10 ladder onto 0-1', () => {
    expect(levelToMastery(1)).toBeCloseTo(0.1)
    expect(levelToMastery(10)).toBeCloseTo(1)
    expect(levelToMastery(5)).toBeCloseTo(0.5)
  })
})
