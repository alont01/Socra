import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateObjectives } from '@/lib/ai/lesson-engine'

const anthropic = new Anthropic()

async function generateFirstSessionIntro(
  sessionId: string,
  student: { name: string; gradeLevel: string; mathTopics: string }
) {
  const topics = (() => {
    try { return JSON.parse(student.mathTopics || '[]') as string[] } catch { return [] }
  })()
  const topicStr = topics.length > 0 ? topics.join(', ') : 'general math'
  const grade = student.gradeLevel || 'their grade level'

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 280,
    messages: [
      {
        role: 'user',
        content: `You are Archie, a friendly magical math wizard. Write a SHORT first message (3 sentences max) to ${student.name}, a ${grade} student. Introduce yourself warmly, then immediately ask them ONE math practice problem appropriate for ${grade} (topics: ${topicStr}). Use LaTeX for math ($...$). Use 1-2 magic-themed emoji. Output the message only.`,
      },
    ],
  })

  const content =
    response.content[0].type === 'text' ? response.content[0].text : ''

  await prisma.message.create({
    data: { sessionId, role: 'assistant', content },
  })
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sessions = await prisma.session.findMany({
      where: { userId: payload.userId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    })

    return NextResponse.json({ sessions })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { title, topic, studentId } = await request.json()

    const [user, priorSessionCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: payload.userId },
        include: { studentProfile: true },
      }),
      prisma.session.count({ where: { userId: payload.userId } }),
    ])

    const student = user?.studentProfile

    const session = await prisma.session.create({
      data: {
        userId: payload.userId,
        studentId: studentId || student?.id || null,
        title: title || 'Math Session',
        topic: topic || '',
      },
    })

    if (topic) {
      generateObjectives(
        session.id,
        topic,
        student?.gradeLevel ?? '',
        student?.goals ?? ''
      ).catch((err) => console.error('Objective generation failed:', err))
    }

    // First session ever — generate Archie's intro + diagnostic question
    if (priorSessionCount === 0 && student) {
      await generateFirstSessionIntro(session.id, student).catch((err) =>
        console.error('First session intro failed:', err)
      )
    }

    return NextResponse.json({ session })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
