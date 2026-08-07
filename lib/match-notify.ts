// Side-effectful notifications for the matching flow, kept out of the engine
// (lib/matching.ts) so the engine stays pure and testable.

import { prisma } from '@/lib/prisma'
import { sendEmail, tutorOfferEmailHtml, matchConfirmedParentEmailHtml } from '@/lib/email'
import { formatSlot, type OverlapSlot } from '@/lib/availability'
import { createLogger } from '@/lib/logger'

const logger = createLogger('match-notify')

/** Email every tutor with a live pending offer for this student. */
export async function notifyTutorsOfOffers(studentId: string): Promise<void> {
  const offers = await prisma.tutorMatchOffer.findMany({
    where: { studentId, status: 'pending' },
    select: {
      overlapSlots: true,
      student: { select: { name: true, gradeLevel: true } },
      tutor: { select: { user: { select: { email: true } } } },
    },
  })

  await Promise.allSettled(
    offers.map((o) => {
      const to = o.tutor.user.email
      // Skip synthetic student-style addresses just in case; tutors have real ones.
      if (!to || to.endsWith('@students.socra.internal')) return Promise.resolve(false)
      let slots: OverlapSlot[] = []
      try {
        slots = JSON.parse(o.overlapSlots)
      } catch {
        slots = []
      }
      const lines = slots.slice(0, 5).map(formatSlot)
      return sendEmail({
        to,
        subject: `New student match: ${o.student.name}`,
        html: tutorOfferEmailHtml(o.student.name, o.student.gradeLevel, lines),
      })
    }),
  ).catch((e) => logger.error('Failed notifying tutors', e, { studentId }))
}

/** Email the parent that their child has been matched with a tutor. */
export async function notifyParentOfMatch(studentId: string, tutorName: string): Promise<void> {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: { name: true, parent: { select: { user: { select: { email: true } } } } },
  })
  const to = student?.parent?.user.email
  if (!to || to.endsWith('@students.socra.internal')) return
  await sendEmail({
    to,
    subject: `${student!.name} has been matched with a tutor`,
    html: matchConfirmedParentEmailHtml(student!.name, tutorName),
  }).catch((e) => logger.error('Failed notifying parent', e, { studentId }))
}
