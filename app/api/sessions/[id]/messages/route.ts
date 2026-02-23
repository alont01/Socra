import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { orchestrate } from '@/lib/ai/orchestrator'
import { getSessionObjectives } from '@/lib/ai/lesson-engine'
import type { OrchestratorContext } from '@/lib/ai/types'

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

    const { content, imageBase64, imageMimeType } = await request.json()

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

    // Load objectives
    const objectives = await getSessionObjectives(sessionId)

    const student = session.student
    const messageHistory = session.messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const ctx: OrchestratorContext = {
      sessionId,
      topic: session.topic,
      student: student
        ? {
            name: student.name,
            gradeLevel: student.gradeLevel,
            mathTopics: student.mathTopics,
            strengthAreas: student.strengthAreas,
            weaknessAreas: student.weaknessAreas,
            learningStyle: student.learningStyle,
            goals: student.goals,
          }
        : null,
      objectives,
      messageHistory,
      imageBase64,
      imageMimeType,
    }

    const encoder = new TextEncoder()
    let assistantText = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of orchestrate(content, ctx)) {
            if (event.type === 'text') {
              assistantText += event.text
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            )
          }

          // Extract and strip <mc> choices from the assistant text
          const mcMatch = assistantText.match(/<mc>(\[[\s\S]*?\])<\/mc>/)
          let choices: string[] | null = null
          if (mcMatch) {
            try {
              choices = JSON.parse(mcMatch[1]) as string[]
              assistantText = assistantText.replace(/<mc>[\s\S]*?<\/mc>/, '').trim()
            } catch {
              // malformed — ignore
            }
          }

          // Save clean assistant message
          await prisma.message.create({
            data: { sessionId, role: 'assistant', content: assistantText },
          })

          // Emit choices event after text is done
          if (choices && choices.length > 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'choices', choices })}\n\n`)
            )
          }

          // Update session timestamp
          await prisma.session.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() },
          })
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
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
