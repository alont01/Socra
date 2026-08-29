import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { updateMasteryScore } from '@/lib/progress'
import { safeJsonParse } from '@/lib/json'
import { rateLimit } from '@/lib/rate-limit'
import { answersMatch } from '@/lib/answer-check'
import { route } from '@/lib/api-handler'
import { practiceAttemptSchema, parseBody } from '@/lib/validations'

export const POST = route('student/practice/[id]/attempt', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireStudent()
  if (!auth.ok) return auth.response

  const rl = rateLimit(`practice:${auth.payload.userId}`, { maxRequests: 60, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const set = await prisma.practiceSet.findUnique({ where: { id } })
  if (!set || set.studentId !== auth.student.id || set.status !== 'assigned') {
    return NextResponse.json({ error: 'Practice set not found' }, { status: 404 })
  }

  const attemptBody = await request.json()
  const parsed = parseBody(practiceAttemptSchema, attemptBody)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { problemIndex, studentAnswer } = parsed.data

  // Server-side answer verification
  const problems = safeJsonParse<{ answer?: string; topic?: string }[]>(set.problems, [])
  const problem = problems[problemIndex]
  if (!problem) {
    return NextResponse.json({ error: 'Invalid problem index' }, { status: 400 })
  }

  // No answer key means we cannot grade this, and "cannot grade" is not the
  // same as "wrong". Marking it false told the student they were incorrect
  // whatever they typed, and pushed the topic's mastery down for it. Record
  // the attempt as ungraded (correct: null) and leave mastery alone.
  const hasKey = !!(problem.answer && problem.answer.trim())
  const correct = hasKey ? answersMatch(studentAnswer, problem.answer!) : null

  // Only the first attempt counts for mastery. Checking for an existing row
  // before inserting doesn't hold: two submissions in flight at once (a double
  // Enter, a retried request) both pass the check and both move mastery. The
  // unique index on (practiceSetId, problemIndex) is the real arbiter — insert
  // first, and treat the conflict as the "already answered" case.
  let attempt
  try {
    attempt = await prisma.practiceSetAttempt.create({
      data: { practiceSetId: id, problemIndex, studentAnswer, correct },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existingAttempt = await prisma.practiceSetAttempt.findUnique({
        where: { practiceSetId_problemIndex: { practiceSetId: id, problemIndex } },
      })
      return NextResponse.json({
        error: 'Already answered this problem',
        attempt: existingAttempt,
        correct: existingAttempt?.correct ?? null,
      }, { status: 409 })
    }
    throw err
  }

  // Reached only by the submission that won the insert, so mastery moves once.
  // An ungraded attempt has no signal to contribute.
  if (problem.topic && correct !== null) {
    await updateMasteryScore(auth.student.id, problem.topic, correct)
  }

  return NextResponse.json({
    attempt,
    correct,
    ungraded: correct === null,
    ...(correct === false ? { correctAnswer: problem.answer } : {}),
  })
})
