import Anthropic from '@anthropic-ai/sdk'
import type { SessionAnalysisResult } from './types'

const client = new Anthropic()

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

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const result = JSON.parse(text)
    return {
      summary: result.summary || '',
      conceptsCovered: result.conceptsCovered || [],
      studentStrengths: result.studentStrengths || [],
      studentGaps: result.studentGaps || [],
      tutorFeedback: result.tutorFeedback || '',
    }
  } catch {
    return {
      summary: 'Analysis could not be generated.',
      conceptsCovered: [],
      studentStrengths: [],
      studentGaps: [],
      tutorFeedback: '',
    }
  }
}
