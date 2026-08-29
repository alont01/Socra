/**
 * @jest-environment node
 */
// Homework is graded by comparing against a stored answer, so assigning a set
// with a blank answer key marks the student wrong whatever they type AND drags
// that topic's mastery down. The guard refuses the assignment instead.
jest.mock('@/lib/prisma', () => ({
  prisma: { practiceSet: { findUnique: jest.fn(), update: jest.fn() } },
}))
jest.mock('@/lib/api-auth', () => ({ requireTutor: jest.fn() }))

import { prisma } from '@/lib/prisma'
import { requireTutor } from '@/lib/api-auth'
import { PATCH } from '@/app/api/tutor/practice-sets/[id]/route'

const p = prisma as unknown as { practiceSet: { findUnique: jest.Mock; update: jest.Mock } }
const mockAuth = requireTutor as jest.Mock

const TUTOR_USER = 'user-tutor'

const withAnswers = [
  { id: 'p1', question: 'Factor x^2-9', hint: '', difficulty: 'easy', topic: 'factoring', answer: '(x-3)(x+3)' },
  { id: 'p2', question: 'Solve 3x+5=20', hint: '', difficulty: 'easy', topic: 'algebra', answer: '5' },
]
const missingSecond = [withAnswers[0], { ...withAnswers[1], answer: '' }]

function storedSet(problems: unknown[], status = 'draft') {
  return {
    id: 'set1',
    title: 'Homework',
    status,
    problems: JSON.stringify(problems),
    assignedAt: null,
    attempts: [],
    tutoringSession: { tutor: { userId: TUTOR_USER } },
  }
}

const patch = (body: Record<string, unknown>) =>
  PATCH(
    new Request('https://socra.test/api/x', { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'set1' }) },
  )

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ ok: true, payload: { userId: TUTOR_USER, email: 'a@b.c', role: 'TUTOR' } })
  p.practiceSet.update.mockResolvedValue({})
})

describe('PATCH practice set — assign guard', () => {
  it('assigns a set whose problems all have answers', async () => {
    p.practiceSet.findUnique
      .mockResolvedValueOnce(storedSet(withAnswers))
      .mockResolvedValueOnce(storedSet(withAnswers, 'assigned'))

    const res = await patch({ problems: withAnswers, status: 'assigned' })
    expect(res.status).toBe(200)
    expect(p.practiceSet.update).toHaveBeenCalled()
  })

  it('refuses to assign when a problem has no answer, naming it', async () => {
    p.practiceSet.findUnique.mockResolvedValue(storedSet(missingSecond))

    const res = await patch({ problems: missingSecond, status: 'assigned' })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/2/)
    // Nothing may be written — a partially-assigned set is what we're avoiding.
    expect(p.practiceSet.update).not.toHaveBeenCalled()
  })

  it('checks the STORED problems when only the status changes', async () => {
    // The tutor flips a saved draft to assigned without resending problems.
    p.practiceSet.findUnique.mockResolvedValue(storedSet(missingSecond))

    const res = await patch({ status: 'assigned' })
    expect(res.status).toBe(400)
    expect(p.practiceSet.update).not.toHaveBeenCalled()
  })

  it('treats a whitespace-only answer as missing', async () => {
    const blank = [{ ...withAnswers[0], answer: '   ' }]
    p.practiceSet.findUnique.mockResolvedValue(storedSet(blank))

    const res = await patch({ problems: blank, status: 'assigned' })
    expect(res.status).toBe(400)
  })

  it('still allows saving an incomplete DRAFT', async () => {
    // Work in progress is fine — only assigning to a student is gated.
    p.practiceSet.findUnique
      .mockResolvedValueOnce(storedSet(missingSecond))
      .mockResolvedValueOnce(storedSet(missingSecond))

    const res = await patch({ problems: missingSecond })
    expect(res.status).toBe(200)
    expect(p.practiceSet.update).toHaveBeenCalled()
  })

  it('refuses a tutor who does not own the session', async () => {
    p.practiceSet.findUnique.mockResolvedValue({
      ...storedSet(withAnswers),
      tutoringSession: { tutor: { userId: 'someone-else' } },
    })
    const res = await patch({ status: 'assigned' })
    expect(res.status).toBe(403)
  })
})
