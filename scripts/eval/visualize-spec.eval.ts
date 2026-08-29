/**
 * Live eval for the whiteboard visualizer.
 *
 * Calls the real model with the real prompt, then runs the result through the
 * real normalizer and renderer, and writes the frames out as SVG so a human can
 * look at them. This is the only way to answer the question unit tests can't:
 * does the model actually *author* a good explanation, not just can the
 * renderer draw one.
 *
 *   ANTHROPIC_API_KEY=... npm run eval:visualize
 *
 * Everything it sends is imported from the source of truth — the system prompt
 * and the model/token settings — so the eval cannot drift from what the live
 * route does.
 */
import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { WHITEBOARD_SPEC_PROMPT } from '@/lib/ai/visual-prompt'
import { extractJson } from '@/lib/ai/parse-json'
import { normalizeDrawSpec, buildSpecFrames, type DrawItem } from '@/lib/whiteboard-draw'
import { config } from '@/lib/config'

const OUT = process.env.EVAL_OUT || path.join(process.cwd(), 'eval-output')
// Defaults to whatever production is configured to use; override to compare
// models on identical scenarios (EVAL_MODEL=claude-opus-5 npm run eval:visualize).
const MODEL = process.env.EVAL_MODEL || config.ai.visualizeModel

interface Scenario {
  name: string
  topic: string
  grade: string
  hint?: string
  transcript?: string
}

const SCENARIOS: Scenario[] = [
  {
    name: 'pythagoras',
    topic: 'Pythagorean theorem',
    grade: '8',
    hint: 'visualize the pythagorean theorem',
  },
  {
    name: 'dividing-fractions',
    topic: 'Dividing fractions',
    grade: '6',
    transcript:
      "Student: I don't get why you flip the second fraction and multiply.\nTutor: Let's look at what dividing actually asks.",
  },
  {
    name: 'completing-the-square',
    topic: 'Completing the square',
    grade: '9',
    hint: 'why is it called completing the square',
  },
  {
    name: 'slope-of-tangent',
    topic: 'Introduction to derivatives',
    grade: '12',
    transcript: "Student: How can a line touch a curve at only one point and still have the same slope?",
  },
  {
    // Control: no natural picture. Should degrade to a note or a simple figure
    // rather than inventing a meaningless diagram.
    name: 'order-of-operations',
    topic: 'Order of operations',
    grade: '6',
    hint: 'PEMDAS',
  },
]

function buildContext(s: Scenario): string {
  return `## Session
- Topic: ${s.topic}
- Student: Alex (Grade ${s.grade})
${s.hint ? `- The tutor asks you to visualize: ${s.hint}` : ''}

## Recent conversation (most recent last)
${s.transcript || '(no transcript captured)'}

## Tutor notes
(none)
`
}

/** Count primitives the model emitted that the renderer refused to draw. */
function countDropped(raw: unknown): { emitted: number; kept: number } {
  const items = (raw as { items?: unknown[] })?.items
  if (!Array.isArray(items)) return { emitted: 0, kept: 0 }
  let emitted = 0
  for (const it of items) {
    const o = it as { primitives?: unknown[]; steps?: { add?: unknown[] }[] }
    if (Array.isArray(o?.primitives)) emitted += o.primitives.length
    if (Array.isArray(o?.steps)) for (const st of o.steps) if (Array.isArray(st?.add)) emitted += st.add.length
  }
  const spec = normalizeDrawSpec(raw)
  let kept = 0
  for (const it of spec?.items || []) {
    if (it.kind === 'shapes') kept += it.primitives.length
    if (it.kind === 'sequence') kept += it.steps.reduce((n, st) => n + st.add.length, 0)
  }
  return { emitted, kept }
}

const describeItem = (it: DrawItem) =>
  it.kind === 'sequence'
    ? `sequence(${it.steps.length} steps${it.steps.some((s) => s.clear) ? ', uses clear' : ''})`
    : it.kind

describe('visualize spec eval', () => {
  // jest.setup.ts injects a dummy 'test-key' so unit tests never see an unset
  // var — check for a real one rather than merely a present one.
  const key = process.env.ANTHROPIC_API_KEY
  if (!key?.startsWith('sk-ant-')) {
    it.skip('needs a real ANTHROPIC_API_KEY', () => {})
    return
  }

  const client = new Anthropic()
  mkdirSync(OUT, { recursive: true })
  const report: string[] = []

  afterAll(() => {
    const text = [`model: ${MODEL}`, ...report].join('\n')
    writeFileSync(path.join(OUT, 'report.txt'), text + '\n')
    console.log('\n' + text + `\n\nFrames written to ${OUT}`)
  })

  for (const scenario of SCENARIOS) {
    it(
      `produces a usable spec for: ${scenario.name}`,
      async () => {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: config.ai.visualizeMaxTokens,
          system: [{ type: 'text', text: WHITEBOARD_SPEC_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: buildContext(scenario) }],
        })

        const block = response.content.find((b) => b.type === 'text')
        const text = block && block.type === 'text' ? block.text : ''
        const raw = extractJson(text)
        const spec = normalizeDrawSpec(raw)

        writeFileSync(path.join(OUT, `${scenario.name}.json`), JSON.stringify(raw, null, 2))

        const { emitted, kept } = countDropped(raw)
        const frames = spec ? buildSpecFrames(spec) : []
        frames.forEach((f, i) => writeFileSync(path.join(OUT, `${scenario.name}-${i}.svg`), f.svg))

        const u = response.usage
        report.push(
          [
            scenario.name.padEnd(24),
            spec ? (spec.items.map(describeItem).join(' + ') || '-').padEnd(34) : 'NO USABLE SPEC'.padEnd(34),
            `${frames.length} frames`.padEnd(10),
            `primitives ${kept}/${emitted}`.padEnd(18),
            `in ${u.input_tokens} cached ${u.cache_read_input_tokens ?? 0} out ${u.output_tokens}`,
          ].join(' '),
        )

        // The only hard assertions: it produced something renderable, and the
        // renderer understood everything the model asked for. A primitive the
        // model invents and the renderer discards is exactly the silent failure
        // that produced a lone diagonal line instead of a triangle.
        expect(spec).not.toBeNull()
        expect(frames.length).toBeGreaterThan(0)
        expect(kept).toBe(emitted)
      },
      600_000,
    )
  }
})
