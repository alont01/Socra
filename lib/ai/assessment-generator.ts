// Generates ONE problem for the adaptive assessment, at a specific difficulty
// level (1-10), avoiding sub-topics already probed this run. Mirrors
// live-problem-generator.ts but produces a single item instead of a batch —
// the assessment engine decides the next level after each answer, so problems
// are generated one at a time rather than upfront.

import { trackedMessage, firstText } from './client'
import { extractJson } from './parse-json'
import { VISUAL_PROMPT_JSON } from './visual-prompt'
import { config } from '@/lib/config'
import { createLogger } from '@/lib/logger'

const logger = createLogger('assessment-generator')

export interface AssessmentProblem {
  question: string
  hint: string
  topic: string
  answer: string
}

interface GenerateAssessmentItemInput {
  topic: string
  studentGrade: string
  studentName: string
  level: number // 1-10
  priorSubTopics: string[] // avoid repeating these
}

function levelLabel(level: number): string {
  if (level <= 3) return 'foundational / easy'
  if (level <= 7) return 'grade-appropriate / medium'
  return 'advanced / challenging'
}

export async function generateAssessmentItem(input: GenerateAssessmentItemInput): Promise<AssessmentProblem> {
  const avoid = input.priorSubTopics.length
    ? `Avoid repeating these sub-topics already covered this assessment: ${input.priorSubTopics.join(', ')}.`
    : ''

  const prompt = `You are administering a live, one-on-one diagnostic math assessment to gauge a student's current level within a topic. Generate exactly ONE problem.

## Student
- Name: ${input.studentName}
- Grade: ${input.studentGrade}
- Topic: ${input.topic}

## Target difficulty
Level ${input.level} out of 10 (${levelLabel(input.level)}). Calibrate the problem precisely to this difficulty — this level was chosen adaptively based on how the student has done so far, so it matters that the problem is neither much easier nor much harder than this level implies.

${avoid}

Respond with ONLY a single JSON object (not an array):
{
  "question": "The math problem",
  "hint": "A brief hint, only useful if the student gets stuck",
  "topic": "the specific sub-topic this problem covers, e.g. 'solving for x in linear equations'",
  "answer": "the correct answer, as a short value (e.g. a number, fraction, or short expression) — not a full worked solution"
}

${VISUAL_PROMPT_JSON}

Only output the JSON object, nothing else.`

  const response = await trackedMessage('assessment_item', {
    model: config.ai.assessmentModel,
    max_tokens: config.ai.assessmentMaxTokens,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = firstText(response)
  const parsed = extractJson<Partial<AssessmentProblem>>(text)

  if (!parsed || typeof parsed.question !== 'string' || !parsed.question.trim() || typeof parsed.answer !== 'string' || !parsed.answer.trim()) {
    logger.error('Failed to parse assessment item', undefined, { rawText: text.slice(0, 500), level: input.level })
    throw new Error('Failed to generate an assessment problem')
  }

  return {
    question: parsed.question,
    hint: typeof parsed.hint === 'string' ? parsed.hint : '',
    topic: typeof parsed.topic === 'string' && parsed.topic.trim() ? parsed.topic : input.topic,
    answer: parsed.answer,
  }
}
