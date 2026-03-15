import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { chatSchema, parseBody } from '@/lib/validations'
import { rateLimit } from '@/lib/rate-limit'

const anthropic = new Anthropic()

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rl = rateLimit(`chat:${payload.userId}`, { maxRequests: 20, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { studentProfile: true },
    })
    const studentProfile = user?.studentProfile ?? null

    const body = await request.json()
    const parsed = parseBody(chatSchema, body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { messages } = parsed.data

    let systemPrompt = `You are Socra, a warm and encouraging AI math tutor who uses the Socratic method.

Core teaching principles:
- NEVER solve problems directly — always guide with questions
- Use the Socratic method: ask leading questions that help the student discover answers
- Celebrate the thinking process, not just correct answers
- When student asks "just tell me the answer", redirect: "What do you think the first step might be?"
- Use LaTeX for all math: inline $...$ and block $$...$$
- Be warm, encouraging, and patient
- Break complex problems into smaller steps`

    if (studentProfile) {
      const topics = JSON.parse(studentProfile.mathTopics || '[]')
      const strengths = JSON.parse(studentProfile.strengthAreas || '[]')
      const weaknesses = JSON.parse(studentProfile.weaknessAreas || '[]')

      systemPrompt += `

You are tutoring ${studentProfile.name}, a ${studentProfile.gradeLevel} student.
Topics: ${topics.join(', ')}
Strengths: ${strengths.join(', ')}
Areas to improve: ${weaknesses.join(', ')}
Learning style: ${studentProfile.learningStyle}
Goals: ${studentProfile.goals}`
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const anthropicStream = anthropic.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 8192,
          system: systemPrompt,
          messages,
        })

        for await (const event of anthropicStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            )
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to stream response' }, { status: 500 })
  }
}
