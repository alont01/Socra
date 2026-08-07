// Tutor↔student matching engine.
//
// Strategy: parallel, first-accept-wins. When a student needs a tutor we find
// eligible tutors (spare capacity + availability overlap), score them
// (load-balanced), and send a batch of time-boxed offers to the top few. The
// first tutor to accept wins; the accept path (in the respond API) atomically
// claims the student via a DB partial-unique index.

import { prisma } from '@/lib/prisma'
import { parseBlocks, overlap, overlapMinutes, type OverlapSlot } from '@/lib/availability'
import { createLogger } from '@/lib/logger'
import { recordEvent } from '@/lib/metrics'

const logger = createLogger('matching')

export const BATCH_SIZE = 3
export const OFFER_TTL_HOURS = 48
export const SESSION_MIN = 60

export type MatchStatus =
  | 'offered' // new offers created this run
  | 'pending' // still-live offers exist; nothing to do
  | 'already_matched' // student already has an active tutor
  | 'exhausted' // every eligible tutor has been offered and passed
  | 'no_eligible' // no tutor fits (capacity/availability) — needs admin

export interface MatchResult {
  status: MatchStatus
  offersCreated?: number
}

interface Candidate {
  tutorId: string
  score: number
  slots: OverlapSlot[]
}

/** Expire any offers past their TTL (lazy — runs whenever we evaluate a student). */
async function expireStale(studentId: string): Promise<void> {
  await prisma.tutorMatchOffer.updateMany({
    where: { studentId, status: 'pending', expiresAt: { lt: new Date() } },
    data: { status: 'expired', respondedAt: new Date() },
  })
}

/**
 * Evaluate a student and, if they need a tutor, create the next batch of offers.
 * Idempotent and safe to call repeatedly (after decline/expire, on child
 * creation, from an admin re-run).
 */
export async function runMatching(studentId: string): Promise<MatchResult> {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: { id: true, desiredHoursPerWeek: true, availability: true, gradeLevel: true },
  })
  if (!student) return { status: 'no_eligible' }

  // Already has an active tutor? Nothing to do.
  const active = await prisma.tutorStudent.findFirst({
    where: { studentId, status: 'active' },
    select: { id: true },
  })
  if (active) return { status: 'already_matched' }

  await expireStale(studentId)

  // Still-live offers → keep waiting, don't pile on more.
  const livePending = await prisma.tutorMatchOffer.count({ where: { studentId, status: 'pending' } })
  if (livePending > 0) return { status: 'pending' }

  const studentBlocks = parseBlocks(student.availability)
  if (studentBlocks.length === 0) return { status: 'no_eligible' }

  // Tutors this student has already been offered to (any status) — don't repeat.
  const priorOffers = await prisma.tutorMatchOffer.findMany({
    where: { studentId },
    select: { tutorId: true, batch: true },
  })
  const alreadyOffered = new Set(priorOffers.map((o) => o.tutorId))
  const nextBatch = priorOffers.reduce((max, o) => Math.max(max, o.batch), 0) + 1

  // Load tutors set up for matching, with their active load.
  const tutors = await prisma.tutorProfile.findMany({
    where: { acceptingStudents: true, maxHoursPerWeek: { not: null } },
    select: {
      id: true,
      availability: true,
      maxHoursPerWeek: true,
      students: { where: { status: 'active' }, select: { hoursPerWeek: true } },
    },
  })

  const candidates: Candidate[] = []
  for (const t of tutors) {
    if (alreadyOffered.has(t.id)) continue
    const maxHours = t.maxHoursPerWeek ?? 0
    const usedHours = t.students.reduce((s, r) => s + r.hoursPerWeek, 0)
    const remaining = maxHours - usedHours
    if (remaining < student.desiredHoursPerWeek) continue

    const slots = overlap(parseBlocks(t.availability), studentBlocks, SESSION_MIN)
    if (slots.length === 0) continue

    const utilization = maxHours > 0 ? usedHours / maxHours : 1
    const studentCount = t.students.length
    // Load-balanced score: reward availability overlap, prefer under-utilized
    // tutors and those with fewer students (fair ramp for newer tutors).
    const score =
      overlapMinutes(slots) +
      (1 - utilization) * 120 +
      (1 / (studentCount + 1)) * 30
    candidates.push({ tutorId: t.id, score, slots })
  }

  if (candidates.length === 0) {
    const status: MatchStatus = alreadyOffered.size > 0 ? 'exhausted' : 'no_eligible'
    recordEvent({
      category: 'match',
      name: 'match.run',
      success: false,
      level: 'warn',
      metadata: { studentId, status },
    })
    return { status }
  }

  candidates.sort((a, b) => b.score - a.score)
  const chosen = candidates.slice(0, BATCH_SIZE)
  const expiresAt = new Date(Date.now() + OFFER_TTL_HOURS * 3600_000)

  await prisma.$transaction(
    chosen.map((c) =>
      prisma.tutorMatchOffer.upsert({
        where: { studentId_tutorId: { studentId, tutorId: c.tutorId } },
        create: {
          studentId,
          tutorId: c.tutorId,
          status: 'pending',
          score: c.score,
          overlapSlots: JSON.stringify(c.slots),
          batch: nextBatch,
          expiresAt,
        },
        update: {}, // never re-offer an existing (already filtered out)
      }),
    ),
  )

  recordEvent({
    category: 'match',
    name: 'match.run',
    success: true,
    metadata: { studentId, offersCreated: chosen.length, batch: nextBatch },
  })

  return { status: 'offered', offersCreated: chosen.length }
}

/** Remaining weekly capacity for a tutor (max − committed active load). */
export async function remainingCapacity(tutorId: string): Promise<number> {
  const t = await prisma.tutorProfile.findUnique({
    where: { id: tutorId },
    select: { maxHoursPerWeek: true, students: { where: { status: 'active' }, select: { hoursPerWeek: true } } },
  })
  if (!t || t.maxHoursPerWeek == null) return 0
  return t.maxHoursPerWeek - t.students.reduce((s, r) => s + r.hoursPerWeek, 0)
}
