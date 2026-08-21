import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { anthropic } from '@/lib/ai/client'
import { config } from '@/lib/config'
import { recordEvent } from '@/lib/metrics'
import { onboardingSchema, parseBody } from '@/lib/validations'
import { route } from '@/lib/api-handler'

export const POST = route('onboarding', async (request: Request) => {
  const auth = await requireStudent()
  if (!auth.ok) return auth.response

  const body = await request.json()
  const parsed = parseBody(onboardingSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { name, gradeLevel, mathTopics, strengthAreas, weaknessAreas, learningStyle, goals } = parsed.data

  // Update student profile
  await prisma.studentProfile.update({
    where: { userId: auth.payload.userId },
    data: {
      name,
      gradeLevel,
      mathTopics: JSON.stringify(mathTopics),
      strengthAreas: JSON.stringify(strengthAreas),
      weaknessAreas: JSON.stringify(weaknessAreas),
      learningStyle,
      goals,
    },
  })

  const systemPrompt = `You are a personalized math learning plan designer. Create a detailed 4-week learning plan for a student based on their profile. Format it as structured JSON with this shape:
{
  "overview": "Brief personalized overview",
  "weeks": [
    {
      "week": 1,
      "theme": "Week theme",
      "topics": ["topic1", "topic2"],
      "goals": ["goal1", "goal2"],
      "dailySessions": 3
    }
  ],
  "focusAreas": ["area1", "area2"],
  "encouragement": "Personalized motivational message"
}`

  const userMessage = `Create a 4-week math learning plan for:
- Name: ${name}
- Grade: ${gradeLevel}
- Math topics interested in: ${mathTopics.join(', ')}
- Strengths: ${strengthAreas.join(', ')}
- Areas to improve: ${weaknessAreas.join(', ')}
- Learning style: ${learningStyle}
- Goals: ${goals}

Return ONLY valid JSON matching the specified format.`

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = ''
      const start = Date.now()
      let inputTokens = 0
      let outputTokens = 0

      const anthropicStream = anthropic.messages.stream({
        model: config.ai.onboardingModel,
        max_tokens: config.ai.onboardingMaxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })

      for await (const event of anthropicStream) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens
        } else if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          fullResponse += event.delta.text
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
          )
        }
      }

      recordEvent({
        category: 'ai',
        name: 'ai.onboarding',
        success: true,
        durationMs: Date.now() - start,
        model: config.ai.onboardingModel,
        inputTokens,
        outputTokens,
      })

      // Save learning plan to DB
      try {
        const jsonMatch = fullResponse.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          await prisma.studentProfile.update({
            where: { userId: auth.payload.userId },
            data: {
              learningPlan: jsonMatch[0],
              onboardingDone: true,
            },
          })
        }
      } catch {
        // ignore parse error
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
})
