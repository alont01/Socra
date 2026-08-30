/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    studentProfile: { findUnique: jest.fn() },
    tutorStudent: { findFirst: jest.fn(), upsert: jest.fn() },
    tutorProfile: { findMany: jest.fn() },
    tutorMatchOffer: { updateMany: jest.fn(), count: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/metrics', () => ({ recordEvent: jest.fn() }))

import { prisma } from '@/lib/prisma'
import { runMatching } from '@/lib/matching'

const p = prisma as unknown as {
  user: { findUnique: jest.Mock }
  studentProfile: { findUnique: jest.Mock }
  tutorStudent: { findFirst: jest.Mock; upsert: jest.Mock }
  tutorProfile: { findMany: jest.Mock }
  tutorMatchOffer: { updateMany: jest.Mock; count: jest.Mock; findMany: jest.Mock; upsert: jest.Mock }
  $transaction: jest.Mock
}

const MON = (start: string, end: string) => ({ day: 1, start, end })

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.DEFAULT_TUTOR_EMAIL
  p.tutorMatchOffer.updateMany.mockResolvedValue({ count: 0 })
  p.tutorMatchOffer.count.mockResolvedValue(0)
  p.tutorMatchOffer.findMany.mockResolvedValue([])
  p.tutorMatchOffer.upsert.mockImplementation((args) => args)
  p.$transaction.mockResolvedValue([])
  p.tutorStudent.findFirst.mockResolvedValue(null)
  p.tutorStudent.upsert.mockResolvedValue({})
  p.tutorProfile.findMany.mockResolvedValue([]) // default: no tutors
})

function student(availability: object[], desiredHoursPerWeek = 1) {
  p.studentProfile.findUnique.mockResolvedValue({
    id: 'stu1', desiredHoursPerWeek, availability: JSON.stringify(availability), gradeLevel: '9',
  })
}

describe('runMatching', () => {
  it('returns already_matched when the student has an active tutor', async () => {
    student([MON('15:00', '18:00')])
    p.tutorStudent.findFirst.mockResolvedValue({ id: 'ts1' })
    expect((await runMatching('stu1')).status).toBe('already_matched')
    expect(p.tutorProfile.findMany).not.toHaveBeenCalled()
  })

  it('returns pending when live offers already exist', async () => {
    student([MON('15:00', '18:00')])
    p.tutorMatchOffer.count.mockResolvedValue(2)
    expect((await runMatching('stu1')).status).toBe('pending')
  })

  it('returns no_eligible when the student has no availability', async () => {
    student([])
    expect((await runMatching('stu1')).status).toBe('no_eligible')
  })

  it('offers only eligible tutors (capacity + overlap) and orders by score', async () => {
    student([MON('15:00', '18:00')], 2) // needs 2 hrs/week
    p.tutorProfile.findMany.mockResolvedValue([
      // A: big overlap, empty, plenty of capacity → strong
      { id: 'A', availability: JSON.stringify([MON('15:00', '18:00')]), maxHoursPerWeek: 10, students: [] },
      // B: overlaps but only 1 hr free (< 2 needed) → excluded
      { id: 'B', availability: JSON.stringify([MON('15:00', '18:00')]), maxHoursPerWeek: 3, students: [{ hoursPerWeek: 2 }] },
      // C: capacity but no time overlap (Tuesday) → excluded
      { id: 'C', availability: JSON.stringify([{ day: 2, start: '15:00', end: '18:00' }]), maxHoursPerWeek: 10, students: [] },
      // D: small overlap, some load → eligible but lower score than A
      { id: 'D', availability: JSON.stringify([MON('16:00', '17:00')]), maxHoursPerWeek: 5, students: [{ hoursPerWeek: 2 }] },
    ])

    const result = await runMatching('stu1')
    expect(result.status).toBe('offered')
    expect(result.offersCreated).toBe(2) // A and D only

    const offeredIds = p.tutorMatchOffer.upsert.mock.calls.map((c) => c[0].create.tutorId)
    expect(offeredIds).toEqual(['A', 'D']) // score-ordered
    expect(offeredIds).not.toContain('B')
    expect(offeredIds).not.toContain('C')
  })

  it('reports exhausted when every eligible tutor was already offered', async () => {
    // Two tutors (so auto-pair doesn't trigger), both already offered.
    student([MON('15:00', '18:00')])
    p.tutorMatchOffer.findMany.mockResolvedValue([
      { tutorId: 'A', batch: 1 },
      { tutorId: 'B', batch: 1 },
    ])
    p.tutorProfile.findMany.mockResolvedValue([
      { id: 'A', availability: JSON.stringify([MON('15:00', '18:00')]), maxHoursPerWeek: 10, students: [] },
      { id: 'B', availability: JSON.stringify([MON('15:00', '18:00')]), maxHoursPerWeek: 10, students: [] },
    ])
    expect((await runMatching('stu1')).status).toBe('exhausted')
  })

  describe('solo auto-pair', () => {
    it('pairs directly with the sole accepting tutor (no availability needed)', async () => {
      student([]) // no availability at all
      p.tutorProfile.findMany.mockResolvedValue([{ id: 'solo' }])
      const result = await runMatching('stu1')
      expect(result.status).toBe('auto_matched')
      expect(result.tutorId).toBe('solo')
      expect(p.tutorStudent.upsert).toHaveBeenCalledTimes(1)
      expect(p.tutorStudent.upsert.mock.calls[0][0].create).toMatchObject({ tutorId: 'solo', studentId: 'stu1', status: 'active' })
      // Should not fall through to the offer flow.
      expect(p.tutorMatchOffer.upsert).not.toHaveBeenCalled()
    })

    it('uses DEFAULT_TUTOR_EMAIL as the primary even with multiple tutors', async () => {
      process.env.DEFAULT_TUTOR_EMAIL = 'alon@socratutoring.com'
      p.user.findUnique.mockResolvedValue({ tutorProfile: { id: 'primary' } })
      student([MON('15:00', '18:00')])
      const result = await runMatching('stu1')
      expect(result.status).toBe('auto_matched')
      expect(result.tutorId).toBe('primary')
    })

    it('does NOT auto-pair when two tutors are accepting (uses offers)', async () => {
      student([MON('15:00', '18:00')], 1)
      p.tutorProfile.findMany.mockResolvedValue([
        { id: 'A', availability: JSON.stringify([MON('15:00', '18:00')]), maxHoursPerWeek: 10, students: [] },
        { id: 'B', availability: JSON.stringify([MON('15:00', '18:00')]), maxHoursPerWeek: 10, students: [] },
      ])
      const result = await runMatching('stu1')
      expect(result.status).toBe('offered')
      expect(p.tutorStudent.upsert).not.toHaveBeenCalled()
    })

    it('excludeTutorId is passed to the accepting-tutors query, so a solo tutor cannot be immediately re-selected after being dropped', async () => {
      // A tutor just ended the pairing (see DELETE /api/tutor/students/[id]).
      // Without the exclusion, "the sole accepting tutor" is still that same
      // tutor, and auto-pair silently reinstates the pairing it was called to
      // remove. The mock doesn't apply Prisma `where` filters itself, so the
      // real assertion is on the query args — a real DB filtering `id: {not:
      // 'solo'}` out is exactly what turns this into an empty result.
      student([]) // no availability — matches the solo auto-pair path
      p.tutorProfile.findMany.mockResolvedValue([{ id: 'solo' }])
      await runMatching('stu1', { excludeTutorId: 'solo' })
      expect(p.tutorProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { not: 'solo' } }) }),
      )
    })

    it('excludeTutorId falls through to no_eligible once the DB has excluded the only candidate', async () => {
      student([]) // no availability — matches the solo auto-pair path
      // What a real DB returns once `id: { not: 'solo' }` has done its job.
      p.tutorProfile.findMany.mockResolvedValue([])
      const result = await runMatching('stu1', { excludeTutorId: 'solo' })
      expect(result.status).toBe('no_eligible')
      expect(p.tutorStudent.upsert).not.toHaveBeenCalled()
    })

    it('excludeTutorId does not block DEFAULT_TUTOR_EMAIL when it names a different tutor', async () => {
      process.env.DEFAULT_TUTOR_EMAIL = 'alon@socratutoring.com'
      p.user.findUnique.mockResolvedValue({ tutorProfile: { id: 'primary' } })
      student([MON('15:00', '18:00')])
      const result = await runMatching('stu1', { excludeTutorId: 'someone-else' })
      expect(result.status).toBe('auto_matched')
      expect(result.tutorId).toBe('primary')
    })
  })
})
