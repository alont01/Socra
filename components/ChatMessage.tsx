'use client'

import MathRenderer from './MathRenderer'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

/** Strips <math-visual>...</math-visual> blocks from text, returning clean text + SVG strings. */
function extractVisualBlocks(content: string): { text: string; visuals: string[] } {
  const visuals: string[] = []
  const text = content.replace(/<math-visual>([\s\S]*?)<\/math-visual>/g, (_, svg: string) => {
    visuals.push(svg.trim())
    return ''
  })
  return { text: text.trim(), visuals }
}

export function ChatMessage({ role, content, streaming = false }: ChatMessageProps) {
  const isUser = role === 'user'
  const { text, visuals } = isUser ? { text: content, visuals: [] } : extractVisualBlocks(content)

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
          isUser
            ? 'bg-stone-200 text-stone-600'
            : 'bg-orange-500 text-white'
        }`}
      >
        {isUser ? 'S' : '∑'}
      </div>

      <div className="flex flex-col gap-2 max-w-[80%]">
        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-orange-500 text-white rounded-tr-sm'
              : 'bg-white border border-orange-100 shadow-sm text-stone-800 rounded-tl-sm'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{text}</p>
          ) : (
            <div className="prose-math">
              <MathRenderer content={text} />
              {streaming && (
                <span className="inline-block w-0.5 h-4 bg-orange-400 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          )}
        </div>

        {/* SVG visuals extracted from <math-visual> blocks (safety net) */}
        {visuals.map((svg, i) => (
          <div
            key={i}
            className="rounded-xl overflow-hidden border border-orange-100 bg-white"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ))}
      </div>
    </div>
  )
}
