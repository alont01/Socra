import { trackedMessage } from './client'
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
    "id": "lp1",
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

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()

  try {
    const problems = JSON.parse(cleaned)
    return problems.map((p: PracticeProblem & { answer?: string }, i: number) => ({
      id: p.id || `lp${i + 1}`,
      question: p.question,
      hint: p.hint || '',
      difficulty: p.difficulty || 'medium',
      topic: p.topic || input.topic,
      answer: p.answer || '',
    }))
  } catch (err) {
    logger.error('Failed to parse live practice response', err, { rawText: text.slice(0, 500) })
    throw new Error('Failed to parse live practice problems from AI response')
  }
}
