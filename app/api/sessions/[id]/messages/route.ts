import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

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

    const { content } = await request.json()

    // Verify session belongs to user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: payload.userId },
      include: {
        student: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Save user message
    await prisma.message.create({
      data: { sessionId, role: 'user', content },
    })

    // Build personalized system prompt
    const student = session.student
    let systemPrompt = `You are Socra, a warm and encouraging AI math tutor who uses the Socratic method.`

    if (student) {
      const topics = JSON.parse(student.mathTopics || '[]')
      const strengths = JSON.parse(student.strengthAreas || '[]')
      const weaknesses = JSON.parse(student.weaknessAreas || '[]')

      systemPrompt += `

You are tutoring ${student.name}, a ${student.gradeLevel} student.
Their math interests: ${topics.join(', ')}
Their strengths: ${strengths.join(', ')}
Areas they want to improve: ${weaknesses.join(', ')}
Their learning style: ${student.learningStyle}
Their goals: ${student.goals}

Personalization guidelines:
- Address ${student.name} by name occasionally (not every message)
- Calibrate difficulty to ${student.gradeLevel} level
- Leverage their strengths in ${strengths.join(', ')} when introducing new concepts
- Give extra patience and scaffolding for ${weaknesses.join(', ')}
- Adapt explanations to their ${student.learningStyle} learning style`
    }

    systemPrompt += `

Core teaching principles:
- NEVER solve problems directly — always guide with questions
- Use the Socratic method: ask leading questions that help the student discover answers
- Celebrate the thinking process, not just correct answers
- When student asks "just tell me the answer", redirect: "What do you think the first step might be?"
- Use LaTeX for all math: inline $...$ and block $$...$$
- Be warm, encouraging, and patient
- Break complex problems into smaller steps
- If a student is stuck, provide a hint, not the solution`

    const messages = session.messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    messages.push({ role: 'user', content })

    const encoder = new TextEncoder()
    let assistantResponse = ''

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
            assistantResponse += event.delta.text
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            )
          }
        }

        // Save assistant message
        await prisma.message.create({
          data: { sessionId, role: 'assistant', content: assistantResponse },
        })

        // Update session timestamp
        await prisma.session.update({
          where: { id: sessionId },
          data: { updatedAt: new Date() },
        })

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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
