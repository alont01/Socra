/**
 * @jest-environment node
 */
import { randomInt, suggestPassword, slugFromName } from '@/lib/child-credentials'

describe('randomInt', () => {
  it('stays within range', () => {
    for (let i = 0; i < 500; i++) {
      const v = randomInt(10)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(10)
    }
  })

  it('rejects a non-positive bound rather than returning NaN', () => {
    expect(() => randomInt(0)).toThrow(RangeError)
    expect(() => randomInt(-3)).toThrow(RangeError)
  })

  it('covers the whole range rather than collapsing to one value', () => {
    const seen = new Set(Array.from({ length: 400 }, () => randomInt(8)))
    expect(seen.size).toBe(8)
  })

  it('uses the CSPRNG, not Math.random', () => {
    const spy = jest.spyOn(Math, 'random')
    randomInt(100)
    // Math.random is seeded predictably; a suggested credential must not
    // depend on it.
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('suggestPassword', () => {
  it('produces the readable two-word-plus-digits shape', () => {
    expect(suggestPassword()).toMatch(/^[a-z]+-[a-z]+\d{4}$/)
  })

  it('always clears the 6-character minimum the form enforces', () => {
    for (let i = 0; i < 100; i++) {
      expect(suggestPassword().length).toBeGreaterThanOrEqual(6)
    }
  })

  it('does not repeat across calls', () => {
    const seen = new Set(Array.from({ length: 200 }, suggestPassword))
    // The old single-word form had only 72k combinations; collisions in 200
    // draws would signal that entropy regressed.
    expect(seen.size).toBe(200)
  })
})

describe('slugFromName', () => {
  it('builds a username from the first name plus digits', () => {
    expect(slugFromName('Maya Rodriguez')).toMatch(/^maya\d{2}$/)
  })

  it('strips characters that are not URL/login safe', () => {
    expect(slugFromName("O'Brien")).toMatch(/^obrien\d{2}$/)
  })

  it('returns empty for a name with nothing usable, so the form can catch it', () => {
    expect(slugFromName('   ')).toBe('')
    expect(slugFromName('!!!')).toBe('')
  })
})
