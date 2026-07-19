import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { updateMasteryScore } from '@/lib/progress'
import { rateLimit } from '@/lib/rate-limit'
import { decryptAnswerToken } from '@/lib/answer-token'
import { answersMatch } from '@/lib/answer-check'
import { livePracticeAnswerSchema, parseBody } from '@/lib/validations'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    // Update mastery in real-time
    await updateMasteryScore(auth.student.id, stored.topic, correct)

    return NextResponse.json({
      correct,
      ...(correct ? {} : { correctAnswer: stored.answer }),
    })
  } catch (err) {
    console.error('[live-practice-answer]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
