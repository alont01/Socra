import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { matchingSetupSchema, parseBody } from '@/lib/validations'
import { parseBlocks } from '@/lib/availability'
import { remainingCapacity } from '@/lib/matching'
import { route } from '@/lib/api-handler'

// Tutor reads their matching setup + current load.
export const GET = route('tutor/matching-setup', async () => {
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const [tutor, activeCount, remaining] = await Promise.all([
    prisma.tutorProfile.findUnique({
      where: { id: auth.tutor.id },
      select: { maxHoursPerWeek: true, availability: true, acceptingStudents: true },
    }),
    prisma.tutorStudent.count({ where: { tutorId: auth.tutor.id, status: 'active' } }),
    remainingCapacity(auth.tutor.id),
  ])

  return NextResponse.json({
    maxHoursPerWeek: tutor?.maxHoursPerWeek ?? null,
    availability: parseBlocks(tutor?.availability),
    acceptingStudents: tutor?.acceptingStudents ?? true,
    activeStudents: activeCount,
    remainingHours: remaining,
  })
})

// Tutor updates capacity / availability / accepting toggle.
export const PATCH = route('tutor/matching-setup', async (request: Request) => {
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const parsed = parseBody(matchingSetupSchema, body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (parsed.data.maxHoursPerWeek !== undefined) data.maxHoursPerWeek = parsed.data.maxHoursPerWeek
  if (parsed.data.availability !== undefined) data.availability = JSON.stringify(parsed.data.availability)
  if (parsed.data.acceptingStudents !== undefined) data.acceptingStudents = parsed.data.acceptingStudents

  await prisma.tutorProfile.update({ where: { id: auth.tutor.id }, data })
  return NextResponse.json({ ok: true })
})
