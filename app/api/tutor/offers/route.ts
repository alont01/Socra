import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { type OverlapSlot } from '@/lib/availability'
import { route } from '@/lib/api-handler'

// Pending student-match offers for this tutor (expired ones filtered out live).
export const GET = route('tutor/offers', async () => {
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  // Lazily expire this tutor's overdue offers so the list is honest.
  await prisma.tutorMatchOffer.updateMany({
    where: { tutorId: auth.tutor.id, status: 'pending', expiresAt: { lt: new Date() } },
    data: { status: 'expired', respondedAt: new Date() },
  })

  const offers = await prisma.tutorMatchOffer.findMany({
    where: { tutorId: auth.tutor.id, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      overlapSlots: true,
      expiresAt: true,
      student: { select: { name: true, gradeLevel: true, goals: true, desiredHoursPerWeek: true } },
    },
  })

  const shaped = offers.map((o) => {
    let slots: OverlapSlot[] = []
    try {
      slots = JSON.parse(o.overlapSlots)
    } catch {
      slots = []
    }
    return {
      id: o.id,
      studentName: o.student.name,
      gradeLevel: o.student.gradeLevel,
      goals: o.student.goals,
      desiredHoursPerWeek: o.student.desiredHoursPerWeek,
      slots,
      expiresAt: o.expiresAt,
    }
  })

  return NextResponse.json({ offers: shaped })
})
