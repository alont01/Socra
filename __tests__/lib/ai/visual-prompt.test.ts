import { WHITEBOARD_SPEC_PROMPT } from '@/lib/ai/visual-prompt'

describe('WHITEBOARD_SPEC_PROMPT', () => {
  it('is long enough to be worth caching', () => {
    // Prompt caching has a ~1024-token minimum prefix; below it the block is
    // silently not cached at all.
    expect(WHITEBOARD_SPEC_PROMPT.length).toBeGreaterThan(4096)
  })

  it('carries no session-specific content', () => {
    // Caching is a prefix match — one interpolated name, topic, or timestamp in
    // here and every request misses the cache.
    expect(WHITEBOARD_SPEC_PROMPT).not.toMatch(/\$\{/)
    expect(WHITEBOARD_SPEC_PROMPT).not.toMatch(/## Session|## Tutor notes|## Recent conversation/)
  })

  it('documents the primitives the renderer can actually draw', () => {
    for (const type of ['polygon', 'polyline', 'rect', 'circle', 'arrow', 'brace', 'rightangle', 'arc', 'text']) {
      expect(WHITEBOARD_SPEC_PROMPT).toContain(`"type":"${type}"`)
    }
  })

  it('describes the sequence contract the renderer implements', () => {
    expect(WHITEBOARD_SPEC_PROMPT).toContain('CUMULATIVE')
    expect(WHITEBOARD_SPEC_PROMPT).toContain('"clear": true')
  })
})
