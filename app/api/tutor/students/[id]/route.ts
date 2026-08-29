import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { route } from '@/lib/api-handler'
import { runMatching } from '@/lib/matching'
import { notifyTutorsOfOffers } from '@/lib/match-notify'
import { createLogger } from '@/lib/logger'

const logger = createLogger('tutor/students/[id]')

export const DELETE = route('tutor/students/[id]', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id: studentId } = await params
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const entry = await prisma.tutorStudent.findUnique({
    where: { tutorId_studentId: { tutorId: auth.tutor.id, studentId } },
  })
  if (!entry || entry.status !== 'active') {
    return NextResponse.json({ error: 'Student not in roster' }, { status: 404 })
  }

  // Ends the pairing rather than deleting the row: `status` is the lifecycle
  // field the rest of the app reads (matching, capacity accounting, the
  // roster listing), and the row is the one place a re-pairing with this same
  // tutor can reactivate onto (see POST /api/tutor/students) instead of
  // colliding with @@unique([tutorId, studentId]).
  await prisma.tutorStudent.updateMany({
    where: { id: entry.id, status: 'active' },
    data: { status: 'ended' },
  })

  // A student a tutor drops needs to be re-matched, not left with no tutor
  // and no path back into the matching flow. Best-effort — the roster change
  // itself already succeeded.
  try {
    const result = await runMatching(studentId)
    if (result.status === 'offered') await notifyTutorsOfOffers(studentId)
  } catch (err) {
    logger.error('Re-match after tutor removed student failed', err, { studentId })
  }

  return NextResponse.json({ success: true })
})
