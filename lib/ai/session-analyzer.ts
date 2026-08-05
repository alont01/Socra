import Anthropic from '@anthropic-ai/sdk'
import { trackedMessage, firstText } from './client'
import { extractJson } from './parse-json'
import type { SessionAnalysisResult } from './types'
import { config } from '@/lib/config'
import { createLogger } from '@/lib/logger'

const logger = createLogger('session-analyzer')

interface AnalyzerInput {
  transcript: string
  tutorNotes: string
  capturedNotes: string
  studentName: string
  studentGrade: string
  topic: string
  whiteboardImage?: string
}

export async function analyzeSession(input: AnalyzerInput): Promise<SessionAnalysisResult> {
  const promptText = `You are an expert math education analyst. Analyze this tutoring session and provide structured feedback.

## Session Info
- Student: ${input.studentName} (Grade ${input.studentGrade})
- Topic: ${input.topic}

## Transcript
${input.transcript}

## Tutor Notes
${input.tutorNotes || 'No notes provided.'}

## Student's Captured Notes
${input.capturedNotes || 'No captured notes.'}
${input.whiteboardImage ? '\n## Whiteboard\nThe attached image shows the whiteboard content drawn during the session. Include observations about the whiteboard drawings in your analysis.' : ''}

Respond in valid JSON with this exact structure:
{
  "summary": "2-3 sentence summary of what happened in the session",
  "conceptsCovered": ["concept1", "concept2"],
  "studentStrengths": ["strength1", "strength2"],
  "studentGaps": ["gap1", "gap2"],
  "tutorFeedback": "2-3 sentences of coaching tips for the tutor to improve their teaching approach"
}

Only output the JSON, nothing else.`

  const content: Anthropic.Messages.ContentBlockParam[] = []
  if (input.whiteboardImage) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: input.whiteboardImage,
      },
    })
  }
  content.push({ type: 'text', text: promptText })

  const response = await trackedMessage('analysis', {
    model: config.ai.analysisModel,
    max_tokens: config.ai.analysisMaxTokens,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
  })

  const text = firstText(response)

  const result = extractJson<Partial<SessionAnalysisResult>>(text)
  if (!result) {
    logger.error('Failed to parse AI response', undefined, { rawText: text.slice(0, 500) })
    throw new Error('Failed to parse session analysis from AI response')
  }

  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
  return {
    summary: typeof result.summary === 'string' ? result.summary : '',
    conceptsCovered: arr(result.conceptsCovered),
    studentStrengths: arr(result.studentStrengths),
    studentGaps: arr(result.studentGaps),
    tutorFeedback: typeof result.tutorFeedback === 'string' ? result.tutorFeedback : '',
  }
}
