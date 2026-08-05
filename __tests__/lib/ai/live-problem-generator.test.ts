/**
 * @jest-environment node
 */
import type Anthropic from '@anthropic-ai/sdk'

jest.mock('@/lib/ai/client', () => {
  const actual = jest.requireActual('@/lib/ai/client')
  return { ...actual, trackedMessage: jest.fn() }
})

import { trackedMessage } from '@/lib/ai/client'
import { generateLiveProblems } from '@/lib/ai/live-problem-generator'

const mockTracked = trackedMessage as jest.MockedFunction<typeof trackedMessage>

function reply(text: string): Anthropic.Message {
  return { content: [{ type: 'text', text }] } as unknown as Anthropic.Message
}

const base = {
  topic: 'Geometry',
  tutorNotes: '',
  studentGrade: '10',
  studentName: 'Ada',
  masteryData: [],
  mode: 'practice' as const,
}

function promptOf(): string {
  return mockTracked.mock.calls[0][1].messages[0].content as string
}

beforeEach(() => {
  mockTracked.mockReset()
})

describe('generateLiveProblems', () => {
  it('parses a valid array and fills defaults', async () => {
    mockTracked.mockResolvedValue(reply(JSON.stringify([{ question: 'Area of a 3x4 rectangle?' }])))

    const result = await generateLiveProblems(base)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'lp1', question: 'Area of a 3x4 rectangle?', difficulty: 'medium', topic: 'Geometry' })
  })

  it('throws when no valid problems can be parsed', async () => {
    mockTracked.mockResolvedValue(reply('no json here'))
    await expect(generateLiveProblems(base)).rejects.toThrow(/parse live practice/i)
  })

  it('throws when the parsed array has no usable questions', async () => {
    mockTracked.mockResolvedValue(reply(JSON.stringify([{ hint: 'x' }, { question: '   ' }])))
    await expect(generateLiveProblems(base)).rejects.toThrow(/parse live practice/i)
  })

  it('uses diagnostic-assessment instructions in assessment mode', async () => {
    mockTracked.mockResolvedValue(reply('[{"question":"q"}]'))
    await generateLiveProblems({ ...base, mode: 'assessment' })
    expect(promptOf()).toMatch(/DIAGNOSTIC ASSESSMENT/)
  })

  it('surfaces weak areas (mastery < 0.5) in practice mode', async () => {
    mockTracked.mockResolvedValue(reply('[{"question":"q"}]'))
    await generateLiveProblems({
      ...base,
      masteryData: [
        { topic: 'angles', mastery: 0.2 },
        { topic: 'area', mastery: 0.9 },
      ],
    })
    const prompt = promptOf()
    expect(prompt).toMatch(/Focus on these weak areas:.*angles/)
  })
})
