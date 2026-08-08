import { answersMatch } from '@/lib/answer-check'

describe('answersMatch', () => {
  it('matches exact strings case-insensitively', () => {
    expect(answersMatch('Increasing', 'increasing')).toBe(true)
    expect(answersMatch('  4 ', '4')).toBe(true)
  })

  it('treats equivalent numeric forms as correct', () => {
    expect(answersMatch('1/2', '0.5')).toBe(true)
    expect(answersMatch('.5', '0.5')).toBe(true)
    expect(answersMatch('2/4', '0.5')).toBe(true)
    expect(answersMatch('0.50', '0.5')).toBe(true)
  })

  it('accepts simple arithmetic equivalence', () => {
    expect(answersMatch('3+1', '4')).toBe(true)
    expect(answersMatch('2*3', '6')).toBe(true)
  })

  it('strips a leading "variable =" prefix', () => {
    expect(answersMatch('x = 2', '2')).toBe(true)
    expect(answersMatch('2', 'x = 2')).toBe(true)
  })

  it('ignores currency symbols and thousands separators', () => {
    expect(answersMatch('$1,000', '1000')).toBe(true)
  })

  it('rejects wrong answers', () => {
    expect(answersMatch('3', '4')).toBe(false)
    expect(answersMatch('1/3', '0.5')).toBe(false)
    expect(answersMatch('cat', 'dog')).toBe(false)
  })

  it('rejects empty answers', () => {
    expect(answersMatch('', '4')).toBe(false)
    expect(answersMatch('4', '')).toBe(false)
  })

  describe('unit-labeled answers', () => {
    it('accepts a bare number when the reference answer states a unit', () => {
      expect(answersMatch('34', '34 cm')).toBe(true)
      expect(answersMatch('34', '34cm')).toBe(true)
    })

    it('accepts a unit when the student states one and the reference is bare', () => {
      expect(answersMatch('34 cm', '34')).toBe(true)
    })

    it('accepts equivalent values with the same unit stated on both sides', () => {
      expect(answersMatch('0.5 in', '1/2 in')).toBe(true)
      expect(answersMatch('72°', '72 °')).toBe(true)
      expect(answersMatch('5%', '5 %')).toBe(true)
    })

    it('is case-insensitive about the unit', () => {
      expect(answersMatch('34 CM', '34 cm')).toBe(true)
    })

    it('rejects a genuinely wrong number even with a matching unit', () => {
      expect(answersMatch('35 cm', '34 cm')).toBe(false)
    })

    it('does not silently accept two different stated units', () => {
      expect(answersMatch('5 kg', '5 lb')).toBe(false)
    })

    it('does not treat a non-numeric answer as a bare-value/unit split', () => {
      expect(answersMatch('triangle', 'circle')).toBe(false)
      expect(answersMatch('positive', 'negative')).toBe(false)
    })
  })
})
