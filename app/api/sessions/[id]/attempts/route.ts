import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { problem, studentAnswer } = await request.json()

    // Verify session belongs to user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: payload.userId },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const attempt = await prisma.practiceAttempt.create({
      data: {
        sessionId,
        problem: typeof problem === 'string' ? problem : JSON.stringify(problem),
        studentAnswer: studentAnswer ?? '',
      },
    })

    return NextResponse.json({ attempt })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
