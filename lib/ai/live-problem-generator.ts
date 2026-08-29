import { randomUUID } from 'node:crypto'
import { trackedMessage, firstText } from './client'
import { extractJson } from './parse-json'
import type { PracticeProblem } from './types'
import { VISUAL_PROMPT_JSON } from './visual-prompt'
import { config } from '@/lib/config'
import { createLogger } from '@/lib/logger'

const logger = createLogger('live-practice')

interface MasteryEntry {
  topic: string
  mastery: number
}

interface LivePracticeInput {
  topic: string
  tutorNotes: string
  studentGrade: string
  studentName: string
  masteryData: MasteryEntry[]
  mode: 'practice' | 'assessment'
}

export async function generateLiveProblems(input: LivePracticeInput): Promise<PracticeProblem[]> {
  const count = config.ai.livePracticeCount

  const masteryContext = input.masteryData.length > 0
    ? input.masteryData
        .map((m) => `- ${m.topic}: ${Math.round(m.mastery * 100)}% mastery`)
        .join('\n')
    : 'No prior mastery data (first session).'

  const weakAreas = input.masteryData
    .filter((m) => m.mastery < 0.5)
    .map((m) => m.topic)

  let modeInstructions: string
  if (input.mode === 'assessment') {
    modeInstructions = `This is a DIAGNOSTIC ASSESSMENT to gauge the student's current level.
Generate ${count} problems at VARYING difficulties (one easy, one medium, one hard).
Cover different sub-topics within "${input.topic}" to get a broad picture of their ability.`
  } else {
    const focusNote = weakAreas.length > 0
      ? `Focus on these weak areas: ${weakAreas.join(', ')}.`
      : `The student has no weak areas recorded yet. Generate a balanced mix.`
    modeInstructions = `Generate ${count} targeted practice problems.
${focusNote}
Calibrate difficulty based on the mastery data — lower mastery means easier problems to build confidence.`
  }

  const prompt = `You are a math tutor's AI assistant generating live practice problems during a tutoring session.

## Student Info
- Name: ${input.studentName}
- Grade: ${input.studentGrade}
- Session topic: ${input.topic}

## Student Mastery Levels
${masteryContext}

## Tutor's Current Notes
${input.tutorNotes || 'No notes yet.'}

## Instructions
${modeInstructions}

Respond in valid JSON as an array of objects:
[
  {
    "question": "The math problem",
    "hint": "A helpful hint",
    "difficulty": "easy|medium|hard",
    "topic": "specific sub-topic",
    "answer": "the correct answer"
  }
]

${VISUAL_PROMPT_JSON}

Only output the JSON array, nothing else.`

  const response = await trackedMessage('live_practice', {
    model: config.ai.livePracticeModel,
    max_tokens: config.ai.livePracticeMaxTokens,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = firstText(response)

  const parsed = extractJson<Array<PracticeProblem & { answer?: string }>>(text)
  if (Array.isArray(parsed)) {
    const problems = parsed
      .filter((p) => p && typeof p.question === 'string' && p.question.trim())
      .map((p) => ({
        // The id is assigned here and the model's own is discarded on purpose.
        // Grading treats (tutoringSessionId, problemId) as unique, so a
        // positional id like "lp1" — which is exactly what the prompt asks for,
        // and what the model returns every time — collided with the previous
        // batch the moment a tutor generated a second set in one session. The
        // student's answer to the new problem hit the old row's unique
        // constraint and came back "already answered" with the earlier grade,
        // locking them out of the problem and never moving mastery.
        id: randomUUID(),
        question: p.question,
        hint: p.hint || '',
        difficulty: p.difficulty || 'medium',
        topic: p.topic || input.topic,
        answer: p.answer || '',
      }))
    if (problems.length > 0) return problems
  }

  logger.error('Failed to parse live practice response', undefined, { rawText: text.slice(0, 500) })
  throw new Error('Failed to parse live practice problems from AI response')
}
