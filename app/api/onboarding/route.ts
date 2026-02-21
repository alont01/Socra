import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, gradeLevel, mathTopics, strengthAreas, weaknessAreas, learningStyle, goals } =
      await request.json()

    // Update student profile
    await prisma.studentProfile.update({
      where: { userId: payload.userId },
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

        const anthropicStream = anthropic.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        })

        for await (const event of anthropicStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            fullResponse += event.delta.text
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            )
          }
        }

        // Save learning plan to DB
        try {
          const jsonMatch = fullResponse.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            await prisma.studentProfile.update({
              where: { userId: payload.userId },
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
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
