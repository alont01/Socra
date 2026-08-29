import { extractJson } from '@/lib/ai/parse-json'

describe('extractJson', () => {
  it('parses clean JSON objects and arrays', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('unwraps ```json fences', () => {
    const raw = '```json\n{"summary":"hi","conceptsCovered":["x"]}\n```'
    expect(extractJson(raw)).toEqual({ summary: 'hi', conceptsCovered: ['x'] })
  })

  it('unwraps plain ``` fences', () => {
    expect(extractJson('```\n[{"id":"p1"}]\n```')).toEqual([{ id: 'p1' }])
  })

  it('extracts JSON embedded in prose', () => {
    const raw = 'Sure! Here is your data:\n{"ok":true}\nHope that helps.'
    expect(extractJson(raw)).toEqual({ ok: true })
  })

  it('repairs trailing commas', () => {
    expect(extractJson('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 })
    expect(extractJson('[1,2,3,]')).toEqual([1, 2, 3])
  })

  it('strips // and /* */ comments', () => {
    const raw = '{\n  "a": 1, // one\n  "b": 2 /* two */\n}'
    expect(extractJson(raw)).toEqual({ a: 1, b: 2 })
  })

  it('does not corrupt a URL inside a string value while stripping comments', () => {
    // Malformed enough (trailing comma) to force the repair path, which used
    // to treat the "//" in the URL as a line comment and truncate the string.
    const raw = '{"url": "https://example.com/path", "a": 1,}'
    expect(extractJson(raw)).toEqual({ url: 'https://example.com/path', a: 1 })
  })

  it('still strips a real comment that follows a string containing //', () => {
    const raw = '{"url": "https://example.com", "a": 1} // trailing note'
    expect(extractJson(raw)).toEqual({ url: 'https://example.com', a: 1 })
  })

  it('does not confuse brackets inside string values', () => {
    expect(extractJson('{"q":"solve for x in [1,2]"}')).toEqual({ q: 'solve for x in [1,2]' })
  })

  it('returns null on unrecoverable input', () => {
    expect(extractJson('not json at all')).toBeNull()
    expect(extractJson('')).toBeNull()
  })

  it('handles arrays of practice problems with LaTeX', () => {
    const raw = '[{"id":"p1","question":"Solve $x^2=4$","answer":"2"}]'
    expect(extractJson(raw)).toEqual([{ id: 'p1', question: 'Solve $x^2=4$', answer: '2' }])
  })
})
