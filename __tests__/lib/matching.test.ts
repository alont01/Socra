/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    studentProfile: { findUnique: jest.fn() },
    tutorStudent: { findFirst: jest.fn() },
    tutorProfile: { findMany: jest.fn() },
    tutorMatchOffer: { updateMany: jest.fn(), count: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/metrics', () => ({ recordEvent: jest.fn() }))

import { prisma } from '@/lib/prisma'
import { runMatching } from '@/lib/matching'

const p = prisma as unknown as {
  studentProfile: { findUnique: jest.Mock }
  tutorStudent: { findFirst: jest.Mock }
  tutorProfile: { findMany: jest.Mock }
  tutorMatchOffer: { updateMany: jest.Mock; count: jest.Mock; findMany: jest.Mock; upsert: jest.Mock }
  $transaction: jest.Mock
}

const MON = (start: string, end: string) => ({ day: 1, start, end })

beforeEach(() => {
  jest.clearAllMocks()
  p.tutorMatchOffer.updateMany.mockResolvedValue({ count: 0 })
  p.tutorMatchOffer.count.mockResolvedValue(0)
  p.tutorMatchOffer.findMany.mockResolvedValue([])
  p.tutorMatchOffer.upsert.mockImplementation((args) => args)
  p.$transaction.mockResolvedValue([])
  p.tutorStudent.findFirst.mockResolvedValue(null)
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
    student([MON('15:00', '18:00')])
    p.tutorMatchOffer.findMany.mockResolvedValue([{ tutorId: 'A', batch: 1 }])
    p.tutorProfile.findMany.mockResolvedValue([
      { id: 'A', availability: JSON.stringify([MON('15:00', '18:00')]), maxHoursPerWeek: 10, students: [] },
    ])
    expect((await runMatching('stu1')).status).toBe('exhausted')
  })
})
