/**
 * @jest-environment node
 */
import type Anthropic from '@anthropic-ai/sdk'
import { firstText } from '@/lib/ai/client'

// Build a minimal Anthropic.Message-shaped object for the content array.
function msg(content: unknown[]): Anthropic.Message {
  return { content } as unknown as Anthropic.Message
}

describe('firstText', () => {
  it('returns the text of a single text block', () => {
    expect(firstText(msg([{ type: 'text', text: 'hello' }]))).toBe('hello')
  })

  it('returns "" when the content array is empty (no crash)', () => {
    expect(firstText(msg([]))).toBe('')
  })

  it('skips a non-text leading block and finds a later text block', () => {
    const m = msg([
      { type: 'tool_use', id: 't1', name: 'x', input: {} },
      { type: 'text', text: 'the answer' },
    ])
    expect(firstText(m)).toBe('the answer')
  })

  it('returns "" when no block is a text block', () => {
    const m = msg([{ type: 'tool_use', id: 't1', name: 'x', input: {} }])
    expect(firstText(m)).toBe('')
  })

  it('returns the first text block when multiple exist', () => {
    const m = msg([
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ])
    expect(firstText(m)).toBe('first')
  })
})
