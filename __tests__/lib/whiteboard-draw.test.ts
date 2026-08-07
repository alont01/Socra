import { normalizeDrawSpec, buildItemSvg, buildSpecSvgs } from '@/lib/whiteboard-draw'

describe('whiteboard-draw', () => {
  describe('normalizeDrawSpec', () => {
    it('keeps a valid graph item', () => {
      const spec = normalizeDrawSpec({
        items: [{ kind: 'graph', title: 'y=x^2', xDomain: [-3, 3], series: [{ expr: 'x^2' }], points: [{ x: 2, y: 4 }] }],
      })
      expect(spec?.items).toHaveLength(1)
      expect(spec?.items[0].kind).toBe('graph')
    })

    it('drops a graph with a bad xDomain', () => {
      expect(normalizeDrawSpec({ items: [{ kind: 'graph', xDomain: ['a', 3] }] })).toBeNull()
    })

    it('keeps a note and filters non-string lines', () => {
      const spec = normalizeDrawSpec({ items: [{ kind: 'note', title: 'Steps', lines: ['x = 2', 5, null, 'done'] }] })
      expect(spec?.items[0]).toMatchObject({ kind: 'note', lines: ['x = 2', 'done'] })
    })

    it('returns null for non-object / missing items', () => {
      expect(normalizeDrawSpec(null)).toBeNull()
      expect(normalizeDrawSpec({})).toBeNull()
      expect(normalizeDrawSpec({ items: 'x' })).toBeNull()
    })

    it('caps at 4 items', () => {
      const many = Array.from({ length: 6 }, () => ({ kind: 'note', lines: ['a'] }))
      expect(normalizeDrawSpec({ items: many })?.items).toHaveLength(4)
    })
  })

  describe('buildItemSvg', () => {
    it('renders a graph with a sampled polyline and points', () => {
      const svg = buildItemSvg({ kind: 'graph', title: 'y = x^2', xDomain: [-2, 2], series: [{ expr: 'x^2' }], points: [{ x: 1, y: 1, label: '(1,1)' }] })
      expect(svg).toContain('<svg')
      expect(svg).toContain('<polyline')
      expect(svg).toContain('(1,1)')
      expect(svg).toContain('y = x^2')
    })

    it('skips a series with an invalid expression without throwing', () => {
      const svg = buildItemSvg({ kind: 'graph', xDomain: [-1, 1], series: [{ expr: 'this is not math ((' }] })
      expect(svg).toContain('<svg')
      expect(svg).not.toContain('<polyline')
    })

    it('escapes HTML in note lines', () => {
      const svg = buildItemSvg({ kind: 'note', lines: ['a < b & c > d'] })
      expect(svg).toContain('a &lt; b &amp; c &gt; d')
    })

    it('renders shape primitives', () => {
      const svg = buildItemSvg({ kind: 'shapes', primitives: [{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }, { type: 'circle', cx: 5, cy: 5, r: 3 }] })
      expect(svg).toContain('<line')
      expect(svg).toContain('<circle')
    })
  })

  it('buildSpecSvgs returns one SVG per item', () => {
    const spec = normalizeDrawSpec({
      items: [
        { kind: 'graph', xDomain: [-1, 1], series: [{ expr: 'x' }] },
        { kind: 'note', lines: ['ok'] },
      ],
    })!
    expect(buildSpecSvgs(spec)).toHaveLength(2)
  })
})
