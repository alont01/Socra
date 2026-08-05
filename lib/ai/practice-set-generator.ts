import { trackedMessage, firstText } from './client'
import { extractJson } from './parse-json'
import type { PracticeProblem } from './types'
import { VISUAL_PROMPT_JSON } from './visual-prompt'
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

  const response = await trackedMessage('practice_set', {
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
    "question": "The math problem",
    "hint": "A helpful hint",
    "difficulty": "easy|medium|hard",
    "topic": "specific sub-topic",
    "answer": "the correct answer"
  }
]

Create a mix of difficulties weighted toward the student's gap areas.

${VISUAL_PROMPT_JSON}

Only output the JSON array, nothing else.`,
      },
    ],
  })

  const text = firstText(response)

  const parsed = extractJson<Array<PracticeProblem & { answer?: string }>>(text)
  if (!Array.isArray(parsed)) {
    // Non-critical: the pipeline continues without a practice set rather than
    // failing the whole session. Logged for visibility.
    logger.error('Failed to parse practice set', undefined, { rawText: text.slice(0, 500) })
    return []
  }

  return parsed
    .filter((p) => p && typeof p.question === 'string' && p.question.trim())
    .map((p, i) => ({
      id: p.id || `p${i + 1}`,
      question: p.question,
      hint: p.hint || '',
      difficulty: p.difficulty || 'medium',
      topic: p.topic || input.topic,
      answer: p.answer || '',
    }))
}
