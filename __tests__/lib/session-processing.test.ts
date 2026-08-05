/**
 * @jest-environment node
 */
// Stub out modules with side-effectful/network clients so we can import the
// pure helper under test without a DB or Daily.co connection.
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/lib/daily', () => ({ fetchTranscriptWithRetry: jest.fn() }))

import { hasMeaningfulContent } from '@/lib/session-processing'

describe('hasMeaningfulContent', () => {
  it('is true when a whiteboard drawing exists, even with no text', () => {
    expect(hasMeaningfulContent('', '', '', true)).toBe(true)
  })

  it('is false when everything is empty and there is no whiteboard', () => {
    expect(hasMeaningfulContent('', '', '', false)).toBe(false)
  })

  it('is false for a trivial amount of text (< 25 chars)', () => {
    expect(hasMeaningfulContent('hi there', '', '', false)).toBe(false)
  })

  it('is true once combined text reaches the 25-char threshold', () => {
    expect(hasMeaningfulContent('We solved several equations today.', '', '', false)).toBe(true)
  })

  it('combines transcript, tutor notes, and captured notes', () => {
    expect(hasMeaningfulContent('short', 'also short', 'more text here', false)).toBe(true)
  })

  it('ignores whitespace-only content that looks long', () => {
    expect(hasMeaningfulContent('   \n\n\t   \n   ', '', '', false)).toBe(false)
  })
})
