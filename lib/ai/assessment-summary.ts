// Synthesizes the adaptive assessment's item history into a holistic result:
// a narrative summary plus strengths/gaps, for both the tutor's session
// review and the student's mastery record. Mirrors session-analyzer.ts.

import { trackedMessage, firstText } from './client'
import { extractJson } from './parse-json'
import { config } from '@/lib/config'
import { createLogger } from '@/lib/logger'
import type { ItemOutcome } from '@/lib/assessment-engine'

const logger = createLogger('assessment-summary')

export interface AssessmentItemRecord {
  index: number
  level: number
  topic: string
  question: string
  outcome: ItemOutcome | null
}

export interface AssessmentSummaryResult {
  summary: string
  strengths: string[]
  gaps: string[]
}

export async function generateAssessmentSummary(input: {
  studentName: string
  studentGrade: string
  topic: string
  estimatedLevel: number
  items: AssessmentItemRecord[]
}): Promise<AssessmentSummaryResult> {
  const itemLines = input.items
    .map((it) => `${it.index}. [Level ${it.level}] ${it.topic} — ${it.outcome ?? 'ungraded'}\n   Q: ${it.question}`)
    .join('\n')

  const prompt = `You are a math education analyst reviewing a completed adaptive diagnostic assessment. The student was given one problem at a time; difficulty rose after a correct answer and fell after an incorrect one (an outcome of "worked_together" means the tutor helped the student through it live — an ambiguous signal, neither a clean success nor failure).

## Student
- Name: ${input.studentName} (Grade ${input.studentGrade})
- Topic assessed: ${input.topic}
- Estimated level reached: ${input.estimatedLevel} / 10

## Problem-by-problem results (in order)
${itemLines}

Write a holistic assessment summary. Respond with ONLY this JSON:
{
  "summary": "2-4 sentences on the student's overall level and trajectory through the assessment",
  "strengths": ["specific sub-topic or skill the student handled well", "..."],
  "gaps": ["specific sub-topic or skill to target next", "..."]
}

Be concrete — name the actual sub-topics from the problems above, not generic labels. Only output the JSON.`

  const response = await trackedMessage('assessment_summary', {
    model: config.ai.assessmentModel,
    max_tokens: config.ai.assessmentSummaryMaxTokens,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = firstText(response)
  const parsed = extractJson<Partial<AssessmentSummaryResult>>(text)

  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

  if (!parsed) {
    logger.error('Failed to parse assessment summary', undefined, { rawText: text.slice(0, 500) })
    // Degrade gracefully rather than block completion of the assessment.
    return { summary: '', strengths: [], gaps: [] }
  }

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    strengths: arr(parsed.strengths),
    gaps: arr(parsed.gaps),
  }
}
