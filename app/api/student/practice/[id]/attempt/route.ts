import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { updateMasteryScore } from '@/lib/progress'
import { safeJsonParse } from '@/lib/json'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireStudent()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`practice:${auth.payload.userId}`, { maxRequests: 60, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const set = await prisma.practiceSet.findUnique({ where: { id } })
    if (!set || set.studentId !== auth.student.id) {
      return NextResponse.json({ error: 'Practice set not found' }, { status: 404 })
    }

    const attemptBody = await request.json()
    const { practiceAttemptSchema, parseBody } = await import('@/lib/validations')
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

    // Prevent re-answering the same problem (only first attempt counts for mastery)
    const existingAttempt = await prisma.practiceSetAttempt.findFirst({
      where: { practiceSetId: id, problemIndex },
    })
    if (existingAttempt) {
      return NextResponse.json({
        error: 'Already answered this problem',
        attempt: existingAttempt,
        correct: existingAttempt.correct,
      }, { status: 409 })
    }

    const correct = problem.answer
      ? studentAnswer.trim().toLowerCase() === problem.answer.trim().toLowerCase()
      : false

    const attempt = await prisma.practiceSetAttempt.create({
      data: {
        practiceSetId: id,
        problemIndex,
        studentAnswer,
        correct,
      },
    })

    // Update mastery for the problem's topic
    if (problem.topic) {
      await updateMasteryScore(auth.student.id, problem.topic, correct)
    }

    return NextResponse.json({
      attempt,
      correct,
      ...(correct ? {} : { correctAnswer: problem.answer }),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
