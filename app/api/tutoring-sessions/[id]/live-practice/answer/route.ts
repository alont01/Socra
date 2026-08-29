import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { updateMasteryScore } from '@/lib/progress'
import { rateLimit } from '@/lib/rate-limit'
import { decryptAnswerToken } from '@/lib/answer-token'
import { answersMatch } from '@/lib/answer-check'
import { livePracticeAnswerSchema, parseBody } from '@/lib/validations'
import { route } from '@/lib/api-handler'

export const POST = route('tutoring-sessions/[id]/live-practice/answer', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireStudent()
  if (!auth.ok) return auth.response

  const rl = rateLimit(`live-answer:${auth.payload.userId}`, { maxRequests: 30, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const body = await request.json()
  const parsed = parseBody(livePracticeAnswerSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { answer, problemId, answerToken } = parsed.data

  // Decrypt the answer token to get the correct answer
  const stored = decryptAnswerToken(answerToken, id, problemId)
  if (!stored) {
    return NextResponse.json({ error: 'Invalid or expired answer token' }, { status: 400 })
  }

  // Verify student belongs to this session
  const session = await prisma.tutoringSession.findUnique({
    where: { id },
    include: { student: true },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!session.student || session.student.userId !== auth.payload.userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const correct = answersMatch(answer, stored.answer)

  // Record the attempt BEFORE touching mastery, and let the unique index on
  // (tutoringSessionId, problemId) decide who wins.
  //
  // Grading here is stateless — the answer comes out of a signed token, not
  // from a stored problem — so nothing else stops the same submission being
  // graded twice. Two in-flight requests (a double Enter) both moved mastery,
  // and worse, a student could resubmit the *revealed* correct answer against
  // the same still-valid token to walk mastery up to 1. Checking for an
  // existing row first doesn't close either case; the constraint does.
  try {
    await prisma.livePracticeAttempt.create({
      data: {
        tutoringSessionId: id,
        studentId: auth.student.id,
        problemId,
        topic: stored.topic,
        studentAnswer: answer,
        correct,
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.livePracticeAttempt.findUnique({
        where: { tutoringSessionId_problemId: { tutoringSessionId: id, problemId } },
      })
      // Return the first answer's result, not this one's, so a duplicate
      // submission can't change what the student sees either.
      const settled = existing?.correct ?? false
      return NextResponse.json(
        {
          error: 'You already answered this problem',
          alreadyAnswered: true,
          correct: settled,
          ...(settled ? {} : { correctAnswer: stored.answer }),
        },
        { status: 409 },
      )
    }
    throw err
  }

  // Reached only by the submission that won the insert, so mastery moves once.
  await updateMasteryScore(auth.student.id, stored.topic, correct)

  return NextResponse.json({
    correct,
    ...(correct ? {} : { correctAnswer: stored.answer }),
  })
})
