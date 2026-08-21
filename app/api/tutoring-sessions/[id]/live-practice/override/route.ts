import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { updateMasteryScore } from '@/lib/progress'
import { z } from 'zod'
import { parseBody } from '@/lib/validations'
import { route } from '@/lib/api-handler'

const overrideSchema = z.object({
  problemTopic: z.string().min(1),
})

/**
 * POST — Tutor overrides an incorrect grade to correct.
 * Applies a positive mastery update to compensate for the wrong grade.
 */
export const POST = route('tutoring-sessions/[id]/live-practice/override', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const body = await request.json()
  const parsed = parseBody(overrideSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const session = await prisma.tutoringSession.findUnique({
    where: { id },
    include: { tutor: true, student: true },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.tutor.userId !== auth.payload.userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }
  if (!session.student) {
    return NextResponse.json({ error: 'No student in session' }, { status: 400 })
  }

  // Apply a correct score to compensate for the earlier incorrect one
  await updateMasteryScore(session.student.id, parsed.data.problemTopic, true)

  return NextResponse.json({ success: true })
})
