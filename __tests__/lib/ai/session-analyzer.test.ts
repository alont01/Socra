/**
 * @jest-environment node
 */
import type Anthropic from '@anthropic-ai/sdk'

// Keep the real firstText; mock only the network call.
jest.mock('@/lib/ai/client', () => {
  const actual = jest.requireActual('@/lib/ai/client')
  return { ...actual, trackedMessage: jest.fn() }
})

import { trackedMessage } from '@/lib/ai/client'
import { analyzeSession } from '@/lib/ai/session-analyzer'

const mockTracked = trackedMessage as jest.MockedFunction<typeof trackedMessage>

function reply(text: string): Anthropic.Message {
  return { content: [{ type: 'text', text }] } as unknown as Anthropic.Message
}

const baseInput = {
  transcript: 'We covered solving linear equations and factoring.',
  tutorNotes: '',
  capturedNotes: '',
  studentName: 'Ada',
  studentGrade: '9',
  topic: 'Algebra',
}

beforeEach(() => {
  mockTracked.mockReset()
})

describe('analyzeSession', () => {
  it('parses a well-formed JSON response', async () => {
    mockTracked.mockResolvedValue(
      reply(
        JSON.stringify({
          summary: 'A good session.',
          conceptsCovered: ['linear equations', 'factoring'],
          studentStrengths: ['algebra'],
          studentGaps: ['word problems'],
          tutorFeedback: 'Slow down on word problems.',
        }),
      ),
    )

    const result = await analyzeSession(baseInput)

    expect(result.summary).toBe('A good session.')
    expect(result.conceptsCovered).toEqual(['linear equations', 'factoring'])
    expect(result.studentStrengths).toEqual(['algebra'])
    expect(result.studentGaps).toEqual(['word problems'])
    expect(result.tutorFeedback).toBe('Slow down on word problems.')
  })

  it('extracts JSON even when wrapped in prose and fences', async () => {
    mockTracked.mockResolvedValue(
      reply('Sure, here you go:\n```json\n{"summary":"hi","conceptsCovered":["x"]}\n```\nHope that helps!'),
    )

    const result = await analyzeSession(baseInput)
    expect(result.summary).toBe('hi')
    expect(result.conceptsCovered).toEqual(['x'])
  })

  it('coerces missing and wrong-typed fields to safe defaults', async () => {
    mockTracked.mockResolvedValue(
      reply(
        JSON.stringify({
          summary: 42, // wrong type -> ''
          conceptsCovered: ['ok', 5, null, 'good'], // non-strings filtered out
          // studentStrengths, studentGaps, tutorFeedback missing
        }),
      ),
    )

    const result = await analyzeSession(baseInput)
    expect(result.summary).toBe('')
    expect(result.conceptsCovered).toEqual(['ok', 'good'])
    expect(result.studentStrengths).toEqual([])
    expect(result.studentGaps).toEqual([])
    expect(result.tutorFeedback).toBe('')
  })

  it('throws when the response contains no parseable JSON', async () => {
    mockTracked.mockResolvedValue(reply('I could not analyze this session.'))
    await expect(analyzeSession(baseInput)).rejects.toThrow(/parse session analysis/i)
  })

  it('throws (does not crash) when the response has an empty content array', async () => {
    mockTracked.mockResolvedValue({ content: [] } as unknown as Anthropic.Message)
    await expect(analyzeSession(baseInput)).rejects.toThrow(/parse session analysis/i)
  })

  it('attaches the whiteboard image as an image block when provided', async () => {
    mockTracked.mockResolvedValue(reply('{"summary":"ok"}'))
    await analyzeSession({ ...baseInput, whiteboardImage: 'BASE64DATA' })

    const params = mockTracked.mock.calls[0][1]
    const content = params.messages[0].content as Anthropic.Messages.ContentBlockParam[]
    expect(content.some((b) => b.type === 'image')).toBe(true)
  })
})
