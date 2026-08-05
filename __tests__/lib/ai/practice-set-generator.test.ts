/**
 * @jest-environment node
 */
import type Anthropic from '@anthropic-ai/sdk'

jest.mock('@/lib/ai/client', () => {
  const actual = jest.requireActual('@/lib/ai/client')
  return { ...actual, trackedMessage: jest.fn() }
})

import { trackedMessage } from '@/lib/ai/client'
import { generatePracticeSet } from '@/lib/ai/practice-set-generator'

const mockTracked = trackedMessage as jest.MockedFunction<typeof trackedMessage>

function reply(text: string): Anthropic.Message {
  return { content: [{ type: 'text', text }] } as unknown as Anthropic.Message
}

const base = { studentGrade: '8', topic: 'Fractions' }

beforeEach(() => {
  mockTracked.mockReset()
})

describe('generatePracticeSet', () => {
  it('short-circuits to [] without calling the model when there are no gaps or concepts', async () => {
    const result = await generatePracticeSet({ ...base, studentGaps: [], conceptsCovered: [] })
    expect(result).toEqual([])
    expect(mockTracked).not.toHaveBeenCalled()
  })

  it('parses problems and fills defaults for missing fields', async () => {
    mockTracked.mockResolvedValue(
      reply(
        JSON.stringify([
          { question: 'What is 1/2 + 1/4?', answer: '3/4' },
          { id: 'x', question: 'Simplify 4/8', hint: 'divide', difficulty: 'easy', topic: 'simplifying', answer: '1/2' },
        ]),
      ),
    )

    const result = await generatePracticeSet({ ...base, studentGaps: ['adding fractions'], conceptsCovered: [] })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'p1', question: 'What is 1/2 + 1/4?', difficulty: 'medium', topic: 'Fractions' })
    expect(result[0].hint).toBe('')
    expect(result[1]).toMatchObject({ id: 'x', difficulty: 'easy', topic: 'simplifying' })
  })

  it('drops entries with no usable question', async () => {
    mockTracked.mockResolvedValue(
      reply(JSON.stringify([{ question: '  ' }, { question: 'Keep me' }, { hint: 'no question' }])),
    )

    const result = await generatePracticeSet({ ...base, studentGaps: ['x'], conceptsCovered: [] })
    expect(result).toHaveLength(1)
    expect(result[0].question).toBe('Keep me')
  })

  it('returns [] (does not throw) when the response is not a JSON array', async () => {
    mockTracked.mockResolvedValue(reply('Sorry, I cannot generate problems right now.'))
    const result = await generatePracticeSet({ ...base, studentGaps: ['x'], conceptsCovered: [] })
    expect(result).toEqual([])
  })

  it('focuses on gaps when present', async () => {
    mockTracked.mockResolvedValue(reply('[]'))
    await generatePracticeSet({ ...base, studentGaps: ['long division'], conceptsCovered: ['addition'] })

    const prompt = mockTracked.mock.calls[0][1].messages[0].content as string
    expect(prompt).toContain('long division')
  })

  it('falls back to covered concepts when there are no gaps', async () => {
    mockTracked.mockResolvedValue(reply('[]'))
    await generatePracticeSet({ ...base, studentGaps: [], conceptsCovered: ['multiplication'] })

    const prompt = mockTracked.mock.calls[0][1].messages[0].content as string
    expect(prompt).toContain('multiplication')
  })
})
