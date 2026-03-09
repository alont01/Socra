import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateMasteryScore } from '@/lib/progress'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const student = await prisma.studentProfile.findUnique({ where: { userId: payload.userId } })
    if (!student) return NextResponse.json({ error: 'Not a student' }, { status: 403 })

    const set = await prisma.practiceSet.findUnique({ where: { id } })
    if (!set || set.studentId !== student.id) {
      return NextResponse.json({ error: 'Practice set not found' }, { status: 404 })
    }

    const { problemIndex, studentAnswer } = await request.json()
    if (problemIndex === undefined || studentAnswer === undefined) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Server-side answer verification
    const problems = JSON.parse(set.problems)
    const problem = problems[problemIndex]
    if (!problem) {
      return NextResponse.json({ error: 'Invalid problem index' }, { status: 400 })
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
      await updateMasteryScore(student.id, problem.topic, correct)
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
