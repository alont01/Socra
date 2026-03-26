import { anthropic } from './client'
import type { PracticeProblem } from './types'
import { config } from '@/lib/config'
import { createLogger } from '@/lib/logger'

const logger = createLogger('practice-generator')

interface GeneratorInput {
  studentGaps: string[]
  conceptsCovered: string[]
  studentGrade: string
  topic: string
}

export async function generatePracticeSet(input: GeneratorInput): Promise<PracticeProblem[]> {
  if (input.studentGaps.length === 0 && input.conceptsCovered.length === 0) {
    return []
  }

  const focusAreas = input.studentGaps.length > 0
    ? input.studentGaps
    : input.conceptsCovered

  const response = await anthropic.messages.create({
    model: config.ai.practiceModel,
    max_tokens: config.ai.practiceMaxTokens,
    messages: [
      {
        role: 'user',
        content: `Generate 5 practice math problems for a Grade ${input.studentGrade} student.

Topic: ${input.topic}
Focus areas (gaps to work on): ${focusAreas.join(', ')}

Respond in valid JSON as an array of objects:
[
  {
    "id": "p1",
    "question": "The math problem (use plain text, no LaTeX)",
    "hint": "A helpful hint",
    "difficulty": "easy|medium|hard",
    "topic": "specific sub-topic",
    "answer": "the correct answer"
  }
]

Create a mix of difficulties weighted toward the student's gap areas.
Only output the JSON array, nothing else.`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()

  try {
    const problems = JSON.parse(cleaned)
    return problems.map((p: PracticeProblem & { answer?: string }, i: number) => ({
      id: p.id || `p${i + 1}`,
      question: p.question,
      hint: p.hint || '',
      difficulty: p.difficulty || 'medium',
      topic: p.topic || input.topic,
      answer: p.answer || '',
    }))
  } catch (err) {
    logger.error('Failed to parse AI response', err, { rawText: text.slice(0, 500) })
    throw new Error('Failed to parse practice set from AI response')
  }
}
