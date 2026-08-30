import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { updateMasteryScore } from '@/lib/progress'
import { z } from 'zod'
import { parseBody } from '@/lib/validations'
import { route } from '@/lib/api-handler'

const overrideSchema = z.object({
  problemTopic: z.string().min(1),
  // Optional for backward compatibility with an older client that only sent a
  // topic. When present it makes the override idempotent — see below.
  problemId: z.string().min(1).optional(),
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
  const { problemTopic, problemId } = parsed.data

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

  // Claim the override before applying it. "Mark Correct" is a plain button on
  // a live panel — a second click, or a retry after a slow response, would
  // otherwise apply the compensating bump again and inflate mastery past what
  // one right answer is worth. The conditional updateMany is the arbiter:
  // exactly one caller flips `overridden` from false.
  //
  // Also requires `correct: false` — without it, overriding an attempt the
  // student already got right applies a second, unearned positive bump on top
  // of the one `updateMasteryScore` already gave it when they answered.
  if (problemId) {
    const claimed = await prisma.livePracticeAttempt.updateMany({
      where: { tutoringSessionId: id, problemId, overridden: false, correct: false },
      data: { overridden: true, correct: true },
    })
    if (claimed.count === 0) {
      // Already overridden, already correct, or the student never submitted an
      // answer for this problem. None of those is an error worth interrupting
      // the tutor over.
      return NextResponse.json({ success: true, alreadyApplied: true })
    }

    // The claim just proved this row exists and names a real problem the
    // student was graded on — read its topic back and apply the compensating
    // bump to THAT, not to `problemTopic` from the request body. Applying the
    // client-supplied topic instead of the claimed row's own would let a
    // tutor (or a stale/buggy client) move mastery on a topic never actually
    // practiced in this exchange.
    const attempt = await prisma.livePracticeAttempt.findUnique({
      where: { tutoringSessionId_problemId: { tutoringSessionId: id, problemId } },
      select: { topic: true },
    })
    await updateMasteryScore(session.student.id, attempt?.topic || problemTopic, true)
    return NextResponse.json({ success: true })
  }

  // No problemId: an older client sent only a topic, with no stored attempt to
  // verify it against. Kept for backward compatibility, but unlike the path
  // above this isn't idempotent and can't be checked against a real record.
  await updateMasteryScore(session.student.id, problemTopic, true)

  return NextResponse.json({ success: true })
})
