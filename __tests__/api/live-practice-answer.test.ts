/**
 * @jest-environment node
 */
// Live practice grades against a signed answer token rather than a stored
// problem, so nothing on the server knew a problem had already been answered.
// The same token could be replayed — submit, read the revealed correct answer,
// submit again — and every replay moved mastery. The unique index on
// (tutoringSessionId, problemId) is the arbiter; these tests pin that contract.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    tutoringSession: { findUnique: jest.fn() },
    livePracticeAttempt: { create: jest.fn(), findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/api-auth', () => ({ requireStudent: jest.fn() }))
jest.mock('@/lib/progress', () => ({ updateMasteryScore: jest.fn() }))
jest.mock('@/lib/answer-token', () => ({ decryptAnswerToken: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ limited: false }) }))

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/api-auth'
import { updateMasteryScore } from '@/lib/progress'
import { decryptAnswerToken } from '@/lib/answer-token'
import { POST } from '@/app/api/tutoring-sessions/[id]/live-practice/answer/route'

const p = prisma as unknown as {
  tutoringSession: { findUnique: jest.Mock }
  livePracticeAttempt: { create: jest.Mock; findUnique: jest.Mock }
}
const mockAuth = requireStudent as jest.Mock
const mockMastery = updateMasteryScore as jest.Mock
const mockDecrypt = decryptAnswerToken as jest.Mock

const STUDENT_USER = 'user-student'

const req = (body: Record<string, unknown>) =>
  POST(
    new Request('https://socra.test/api/x', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'sess1' }) },
  )

const payload = { problemId: 'prob-A', answer: '42', answerToken: 'tok' }

function duplicateKeyError() {
  return new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: '5.22.0',
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({
    ok: true,
    payload: { userId: STUDENT_USER, email: 'a@b.c', role: 'STUDENT' },
    student: { id: 'stu1' },
  })
  p.tutoringSession.findUnique.mockResolvedValue({
    id: 'sess1',
    student: { id: 'stu1', userId: STUDENT_USER },
  })
  mockDecrypt.mockReturnValue({ answer: '42', topic: 'algebra' })
})

describe('POST live-practice answer', () => {
  it('grades a first correct answer and moves mastery exactly once', async () => {
    p.livePracticeAttempt.create.mockResolvedValue({ id: 'la1' })
    const res = await req(payload)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.correct).toBe(true)
    expect(mockMastery).toHaveBeenCalledTimes(1)
    expect(mockMastery).toHaveBeenCalledWith('stu1', 'algebra', true)
  })

  it('reveals the answer only when the student got it wrong', async () => {
    p.livePracticeAttempt.create.mockResolvedValue({ id: 'la1' })
    mockDecrypt.mockReturnValue({ answer: '7', topic: 'algebra' })
    const body = await (await req(payload)).json()

    expect(body.correct).toBe(false)
    expect(body.correctAnswer).toBe('7')
  })

  it('does not leak the answer on a correct submission', async () => {
    p.livePracticeAttempt.create.mockResolvedValue({ id: 'la1' })
    const body = await (await req(payload)).json()
    expect(body).not.toHaveProperty('correctAnswer')
  })

  it('records the attempt BEFORE moving mastery', async () => {
    const order: string[] = []
    p.livePracticeAttempt.create.mockImplementation(async () => { order.push('insert'); return { id: 'la1' } })
    mockMastery.mockImplementation(async () => { order.push('mastery') })
    await req(payload)
    expect(order).toEqual(['insert', 'mastery'])
  })

  it('rejects a replay and leaves mastery untouched', async () => {
    p.livePracticeAttempt.create.mockRejectedValue(duplicateKeyError())
    p.livePracticeAttempt.findUnique.mockResolvedValue({ correct: false, studentAnswer: '7' })

    const res = await req(payload)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.alreadyAnswered).toBe(true)
    // The whole point: a replayed token must not move the score.
    expect(mockMastery).not.toHaveBeenCalled()
  })

  it('returns the FIRST answer’s result on a replay, not the new one', async () => {
    // Student originally got it wrong, then replays with the revealed answer.
    p.livePracticeAttempt.create.mockRejectedValue(duplicateKeyError())
    p.livePracticeAttempt.findUnique.mockResolvedValue({ correct: false, studentAnswer: '7' })

    const body = await (await req(payload)).json()
    expect(body.correct).toBe(false)
  })

  it('rejects an invalid or expired token before any write', async () => {
    mockDecrypt.mockReturnValue(null)
    const res = await req(payload)
    expect(res.status).toBe(400)
    expect(p.livePracticeAttempt.create).not.toHaveBeenCalled()
    expect(mockMastery).not.toHaveBeenCalled()
  })

  it('refuses a student who is not in the session', async () => {
    p.tutoringSession.findUnique.mockResolvedValue({
      id: 'sess1',
      student: { id: 'other', userId: 'someone-else' },
    })
    const res = await req(payload)
    expect(res.status).toBe(403)
    expect(mockMastery).not.toHaveBeenCalled()
  })
})
