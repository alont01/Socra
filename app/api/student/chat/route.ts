import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { anthropic } from '@/lib/ai/client'
import { config } from '@/lib/config'
import { rateLimit } from '@/lib/rate-limit'
import { recordEvent } from '@/lib/metrics'
import { chatSchema, parseBody } from '@/lib/validations'

export async function POST(request: Request) {
  try {
    const auth = await requireStudent()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`student-chat:${auth.payload.userId}`, { maxRequests: 20, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const body = await request.json()
    const parsed = parseBody(chatSchema, body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { messages } = parsed.data

    const student = auth.student
    const systemPrompt = `You are a friendly math tutor AI helping ${student.name}, a ${student.gradeLevel || 'student'}.
Their math topics: ${student.mathTopics || 'general math'}.
Their goals: ${student.goals || 'improve math skills'}.

Be encouraging, use the Socratic method when appropriate (guide them to answers rather than just giving answers).
Keep responses concise and focused. Use plain text for math expressions.`

    const start = Date.now()
    const stream = await anthropic.messages.stream({
      model: config.ai.studentChatModel,
      max_tokens: config.ai.studentChatMaxTokens,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        let inputTokens = 0
        let outputTokens = 0
        try {
          for await (const event of stream) {
            if (event.type === 'message_start') {
              inputTokens = event.message.usage.input_tokens
            } else if (event.type === 'message_delta') {
              outputTokens = event.usage.output_tokens
            } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const data = JSON.stringify({ type: 'text', text: event.delta.text })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          recordEvent({
            category: 'ai',
            name: 'ai.student_chat',
            success: true,
            durationMs: Date.now() - start,
            model: config.ai.studentChatModel,
            inputTokens,
            outputTokens,
          })
        } catch (err) {
          recordEvent({
            category: 'ai',
            name: 'ai.student_chat',
            level: 'error',
            success: false,
            durationMs: Date.now() - start,
            model: config.ai.studentChatModel,
            metadata: { error: err instanceof Error ? err.message : String(err) },
          })
          controller.error(err)
        }
      },
    })

    return new Response(readableStream, {
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
