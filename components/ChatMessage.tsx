'use client'

import MathRenderer from './MathRenderer'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export function ChatMessage({ role, content, streaming = false }: ChatMessageProps) {
  const isUser = role === 'user'

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

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-orange-500 text-white rounded-tr-sm'
            : 'bg-white border border-orange-100 shadow-sm text-stone-800 rounded-tl-sm'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose-math">
            <MathRenderer content={content} />
            {streaming && (
              <span className="inline-block w-0.5 h-4 bg-orange-400 ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
