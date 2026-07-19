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
})
