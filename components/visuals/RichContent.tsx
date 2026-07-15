'use client'

import { useMemo } from 'react'
import MathRenderer from '@/components/MathRenderer'
import { FunctionPlot, type PlotSpec } from '@/components/visuals/FunctionPlot'
import { SvgFigure } from '@/components/visuals/SvgFigure'
import { extractJson } from '@/lib/ai/parse-json'

type Block =
  | { kind: 'text'; value: string }
  | { kind: 'plot'; value: string }
  | { kind: 'svg'; value: string }

// Matches ```plot / ```geometry / ```svg fenced blocks. Incomplete blocks during
// streaming simply don't match yet and stay as text until the closing fence.
const BLOCK_RE = /```(plot|geometry|svg)\s*\n([\s\S]*?)```/g

function parse(content: string): Block[] {
  const blocks: Block[] = []
  let last = 0
  let m: RegExpExecArray | null
  BLOCK_RE.lastIndex = 0
  while ((m = BLOCK_RE.exec(content)) !== null) {
    if (m.index > last) blocks.push({ kind: 'text', value: content.slice(last, m.index) })
    const lang = m[1]
    blocks.push({ kind: lang === 'plot' ? 'plot' : 'svg', value: m[2].trim() })
    last = BLOCK_RE.lastIndex
  }
  if (last < content.length) blocks.push({ kind: 'text', value: content.slice(last) })
  return blocks
}

function PlotBlock({ value }: { value: string }) {
  const spec = useMemo<PlotSpec | null>(() => {
    const parsed = extractJson<PlotSpec>(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  }, [value])

  if (!spec) {
    return (
      <div className="my-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-400">
        Could not render graph.
      </div>
    )
  }
  return <FunctionPlot spec={spec} />
}

/**
 * Renders an AI message with inline visuals: LaTeX math (via MathRenderer),
 * function graphs (```plot JSON), and geometry figures (```geometry / ```svg).
 */
export function RichContent({ content }: { content: string }) {
  const blocks = useMemo(() => parse(content), [content])

  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'plot') return <PlotBlock key={i} value={b.value} />
        if (b.kind === 'svg') return <SvgFigure key={i} svg={b.value} />
        if (!b.value.trim()) return null
        return <MathRenderer key={i} content={b.value} />
      })}
    </>
  )
}
