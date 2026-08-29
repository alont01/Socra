/**
 * @jest-environment node
 */
import { createAnswerToken, decryptAnswerToken } from '@/lib/answer-token'
import { config } from '@/lib/config'

const SESSION = 'session-abc'
const PROBLEM = 'problem-xyz'
const payload = { answer: '42', topic: 'Algebra' }

describe('answer tokens', () => {
  it('round-trips the answer for the session and problem it was minted for', () => {
    const token = createAnswerToken(payload, SESSION, PROBLEM)
    expect(decryptAnswerToken(token, SESSION, PROBLEM)).toEqual(payload)
  })

  it('does not leak the answer into the token text', () => {
    const token = createAnswerToken({ answer: 'sixtyseven', topic: 'Algebra' }, SESSION, PROBLEM)
    expect(token).not.toContain('sixtyseven')
  })

  it('refuses a token replayed against a different problem or session', () => {
    const token = createAnswerToken(payload, SESSION, PROBLEM)
    expect(decryptAnswerToken(token, SESSION, 'another-problem')).toBeNull()
    expect(decryptAnswerToken(token, 'another-session', PROBLEM)).toBeNull()
  })

  it('rejects tampered and malformed tokens', () => {
    const token = createAnswerToken(payload, SESSION, PROBLEM)
    const tampered = `${token.slice(0, -4)}AAAA`
    expect(decryptAnswerToken(tampered, SESSION, PROBLEM)).toBeNull()
    expect(decryptAnswerToken('', SESSION, PROBLEM)).toBeNull()
    expect(decryptAnswerToken('not-a-token', SESSION, PROBLEM)).toBeNull()
  })

  describe('expiry', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    it('accepts a token inside its window', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const token = createAnswerToken(payload, SESSION, PROBLEM)

      jest.setSystemTime(new Date('2026-01-01T01:00:00Z'))
      expect(decryptAnswerToken(token, SESSION, PROBLEM)).toEqual(payload)
    })

    // Without this the token was valid forever, leaving the DB's unique
    // (session, problem) index as the only thing preventing a student
    // resubmitting a revealed answer to walk mastery up.
    it('rejects a token once its window has passed', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const token = createAnswerToken(payload, SESSION, PROBLEM)

      const pastTtl = config.session.staleAfterHours * 3_600_000 + 60_000
      jest.setSystemTime(new Date(Date.now() + pastTtl))
      expect(decryptAnswerToken(token, SESSION, PROBLEM)).toBeNull()
    })
  })
})
