import { normalizeDrawSpec, buildItemSvg, buildItemFrames, buildSpecFrames, buildSpecSvgs } from '@/lib/whiteboard-draw'

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

    it('keeps a shapes item and accepts flat / string point lists', () => {
      const spec = normalizeDrawSpec({
        items: [
          {
            kind: 'shapes',
            primitives: [
              { type: 'polygon', points: [0, 100, 80, 100, 0, 40] },
              { type: 'polyline', points: '0,0 10,10' },
              { type: 'rightangle', x: 0, y: 100, ax: 80, ay: 100, bx: 0, by: 40 },
            ],
          },
        ],
      })
      const item = spec?.items[0] as { kind: string; primitives: { type: string; points?: number[][] }[] }
      expect(item.primitives).toHaveLength(3)
      expect(item.primitives[0].points).toEqual([[0, 100], [80, 100], [0, 40]])
    })

    it('drops primitives the renderer cannot draw', () => {
      const spec = normalizeDrawSpec({
        items: [
          {
            kind: 'shapes',
            primitives: [
              { type: 'ellipse', cx: 5, cy: 5, rx: 3, ry: 2 },
              { type: 'line', x1: 'a', y1: 0, x2: 10, y2: 10 },
              { type: 'polygon', points: [[0, 0], [1, 1]] },
              { type: 'circle', cx: 5, cy: 5, r: 3 },
            ],
          },
        ],
      })
      const item = spec?.items[0] as { primitives: { type: string }[] }
      expect(item.primitives.map((p) => p.type)).toEqual(['circle'])
    })

    it('drops a shapes item that is nothing but labels', () => {
      expect(
        normalizeDrawSpec({ items: [{ kind: 'shapes', primitives: [{ type: 'text', x: 1, y: 1, text: 'a' }] }] }),
      ).toBeNull()
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

    it('renders a closed polygon for a triangle', () => {
      const svg = buildItemSvg({
        kind: 'shapes',
        primitives: [{ type: 'polygon', points: [[0, 100], [80, 100], [0, 40]], fill: '#fff7ed' }],
      })
      expect(svg).toContain('<polygon')
      expect(svg).toContain('fill="#fff7ed"')
    })

    it('draws the right-angle marker at a constant size regardless of figure scale', () => {
      const marker = (scale: number) =>
        buildItemSvg({
          kind: 'shapes',
          primitives: [
            { type: 'polygon', points: [[0, 0], [10 * scale, 0], [0, 10 * scale]] },
            { type: 'rightangle', x: 0, y: 0, ax: 10 * scale, ay: 0, bx: 0, by: 10 * scale },
          ],
        })
      const pts = (svg: string) => svg.match(/<polyline points="([^"]+)"/)![1]
      expect(pts(marker(1))).toBe(pts(marker(100)))
    })

    it('fits an undersized figure to the frame', () => {
      const svg = buildItemSvg({ kind: 'shapes', primitives: [{ type: 'polygon', points: [[0, 0], [4, 0], [0, 3]] }] })
      const xs = svg
        .match(/<polygon points="([^"]+)"/)![1]
        .split(' ')
        .map((p) => Number(p.split(',')[0]))
      // A 4-unit-wide triangle should still span most of the 480px canvas.
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(200)
    })

    it('keeps labels inside the canvas', () => {
      const svg = buildItemSvg({
        kind: 'shapes',
        primitives: [
          { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 },
          { type: 'text', x: -400, y: -80, text: 'off canvas' },
        ],
      })
      const [, x, y] = svg.match(/<text x="(-?[\d.]+)" y="(-?[\d.]+)" font-size="14"/)!.map(Number)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(320)
    })

    it('separates two labels that would land on top of each other', () => {
      const svg = buildItemSvg({
        kind: 'shapes',
        primitives: [
          { type: 'line', x1: 0, y1: 0, x2: 100, y2: 100 },
          { type: 'text', x: 50, y: 50, text: 'first' },
          { type: 'text', x: 50, y: 50, text: 'second' },
        ],
      })
      const ys = [...svg.matchAll(/<text x="[\d.-]+" y="([\d.-]+)" font-size="14"/g)].map((m) => Number(m[1]))
      expect(ys).toHaveLength(2)
      expect(ys[0]).not.toBe(ys[1])
    })

    it('wraps a long note line instead of overflowing the card', () => {
      const long = 'the hypotenuse is the side opposite the right angle and it is always the longest side'
      const svg = buildItemSvg({ kind: 'note', lines: [long] })
      expect([...svg.matchAll(/<text /g)]).toHaveLength(2)
    })
  })

  describe('sequence', () => {
    const seq = (steps: unknown[]) => normalizeDrawSpec({ items: [{ kind: 'sequence', steps }] })

    const tri = { type: 'polygon', points: [[0, 0], [10, 0], [0, 10]] }
    const box = { type: 'rect', x: 0, y: 0, width: 10, height: 10 }

    it('keeps a multi-step sequence and its captions', () => {
      const spec = seq([
        { caption: 'first', add: [tri] },
        { caption: 'second', add: [box] },
      ])
      expect(spec?.items[0].kind).toBe('sequence')
      expect(buildSpecFrames(spec!).map((f) => f.caption)).toEqual(['first', 'second'])
    })

    it('accumulates earlier steps into later frames', () => {
      const frames = buildSpecFrames(seq([{ add: [tri] }, { add: [box] }])!)
      expect(frames[0].svg).toContain('<polygon')
      expect(frames[0].svg).not.toContain('<rect x=')
      expect(frames[1].svg).toContain('<polygon')
      expect(frames[1].svg).toContain('<rect x=')
    })

    it('starts fresh on a step marked clear', () => {
      const frames = buildSpecFrames(seq([{ add: [tri] }, { clear: true, add: [box] }])!)
      expect(frames[1].svg).not.toContain('<polygon')
      expect(frames[1].svg).toContain('<rect x=')
    })

    it('holds the figure still as steps are revealed', () => {
      // The shared shape must land on identical pixels in every frame, even
      // though later steps add geometry outside it.
      const frames = buildSpecFrames(
        seq([{ add: [tri] }, { add: [{ type: 'circle', cx: 200, cy: 200, r: 5 }] }])!,
      )
      const poly = (svg: string) => svg.match(/<polygon points="([^"]+)"/)![1]
      expect(poly(frames[0].svg)).toBe(poly(frames[1].svg))
    })

    it('caps at 6 steps', () => {
      const spec = seq(Array.from({ length: 9 }, (_, i) => ({ caption: `s${i}`, add: [tri] })))
      expect(buildSpecFrames(spec!)).toHaveLength(6)
    })

    it('keeps the whole caption — the punchline lives at the end', () => {
      // Regression: a 2-line cap silently amputated "b²" off the end of
      // "…so c² = a² + b²", losing the conclusion of the entire explanation.
      const caption =
        'The leftover now falls into two squares: one of side a, one of side b. Same square, same four triangles removed — so c² = a² + b².'
      const svg = buildSpecFrames(seq([{ add: [tri] }, { caption, add: [box] }])!)[1].svg
      expect(svg).toContain('b².')
      expect(svg).not.toContain('…')
    })

    it('ellipsizes a caption too long even for the bar, rather than cutting silently', () => {
      const caption = 'word '.repeat(120).trim()
      const svg = buildSpecFrames(seq([{ add: [tri] }, { caption, add: [box] }])!)[1].svg
      expect(svg).toContain('…')
    })

    it('numbers the frames', () => {
      const frames = buildSpecFrames(seq([{ add: [tri] }, { add: [box] }])!)
      expect(frames[0].svg).toContain('1 / 2')
      expect(frames[1].svg).toContain('2 / 2')
    })

    it('downgrades a one-step sequence to a static figure', () => {
      const spec = seq([{ caption: 'only', add: [tri] }])
      expect(spec?.items[0].kind).toBe('shapes')
    })

    it('drops a sequence with nothing drawable', () => {
      expect(seq([{ caption: 'a', add: [] }, { caption: 'b', add: [] }])).toBeNull()
    })

    it('collapses to the finished frame as a single image', () => {
      const spec = seq([{ add: [tri] }, { add: [box] }])!
      expect(buildItemSvg(spec.items[0])).toBe(buildItemFrames(spec.items[0])[1].svg)
    })
  })

  describe('annotations', () => {
    it('draws an arrow as a shaft plus a filled head', () => {
      const svg = buildItemSvg({
        kind: 'shapes',
        primitives: [{ type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, label: 'moves here' }],
      })
      expect(svg).toContain('<line')
      expect(svg).toMatch(/<polygon points="[^"]+" fill="#ea580c"/)
      expect(svg).toContain('moves here')
    })

    it('draws a brace with its label', () => {
      const svg = buildItemSvg({
        kind: 'shapes',
        primitives: [{ type: 'brace', x1: 0, y1: 0, x2: 100, y2: 0, label: 'a + b' }],
      })
      expect(svg).toContain('<path d="M ')
      expect(svg).toContain('a + b')
    })

    it('keeps a brace label inside the frame', () => {
      // The brace is drawn beside its segment at a fixed size, which the
      // bounding box can't see — the fit has to reserve room for it.
      const svg = buildItemSvg({
        kind: 'shapes',
        primitives: [
          { type: 'rect', x: 0, y: 0, width: 100, height: 100 },
          { type: 'brace', x1: 0, y1: 0, x2: 100, y2: 0, label: 'a + b', flip: true },
        ],
      })
      const labelY = Number(svg.match(/y="([\d.-]+)" font-size="13" text-anchor="middle"/)![1])
      expect(labelY).toBeGreaterThan(0)
    })

    it('passes opacity through to the rendered shape', () => {
      const spec = normalizeDrawSpec({
        items: [{ kind: 'shapes', primitives: [{ type: 'rect', x: 0, y: 0, width: 10, height: 10, opacity: 0.3 }] }],
      })!
      expect(buildItemSvg(spec.items[0])).toContain('opacity="0.3"')
    })

    it('ignores an out-of-range opacity', () => {
      const spec = normalizeDrawSpec({
        items: [{ kind: 'shapes', primitives: [{ type: 'rect', x: 0, y: 0, width: 10, height: 10, opacity: 4 }] }],
      })!
      expect(buildItemSvg(spec.items[0])).not.toContain('opacity=')
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
