'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { RichContent } from '@/components/visuals/RichContent'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Starter prompts shown on an empty chat — a couple showcase inline visuals.
const SUGGESTIONS = [
  'Explain the Pythagorean theorem',
  'Graph y = x² and y = 2x',
  'Help me solve 3x + 5 = 20',
  'Quiz me on fractions',
]

// Shown instead when the student is sitting on a specific problem: the useful
// openings there are all about the thing in front of them.
const PROBLEM_SUGGESTIONS = [
  'Give me a hint',
  'How do I start this one?',
  'Show me a similar example',
  'Explain the idea behind this',
]

const MAX_STORED = 50

interface StudentChatPanelProps {
  /**
   * The question the student is currently looking at, when the panel sits
   * beside a problem. Sent with each message so "I'm stuck" has a referent.
   * Question text only — never the answer.
   */
  problemContext?: string
}

export function StudentChatPanel({ problemContext }: StudentChatPanelProps = {}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [restored, setRestored] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const storageKey = user ? `socra.chat.${user.id}` : null

  // Restore a saved conversation for this user.
  useEffect(() => {
    if (!storageKey) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setMessages(parsed)
      }
    } catch {
      // ignore corrupt storage
    }
    setRestored(true)
  }, [storageKey])

  // Persist after each completed turn (not mid-stream).
  useEffect(() => {
    if (!storageKey || !restored || streaming) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-MAX_STORED)))
    } catch {
      // storage full / unavailable — non-fatal
    }
  }, [messages, streaming, storageKey, restored])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const newChat = () => {
    if (streaming) return
    setMessages([])
    setInput('')
    if (storageKey) localStorage.removeItem(storageKey)
  }

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || streaming) return

    const userMessage: ChatMessage = { role: 'user', content: trimmed }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/student/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, problemContext }),
      })

      if (!res.ok || !res.body) {
        setMessages((prev) => prev.slice(0, -1))
        toast('Failed to send message', 'error')
        setStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'text') {
                setMessages((prev) => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, content: last.content + parsed.text }
                  }
                  return updated
                })
              }
            } catch {
              // skip parse errors
            }
          }
        }
      }
    } catch {
      setMessages((prev) => prev.slice(0, -1))
      toast('Failed to send message', 'error')
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header (only once a conversation exists) */}
      {messages.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-stone-900/5">
          <span className="text-xs font-medium text-stone-400">AI Tutor</span>
          <button
            onClick={newChat}
            disabled={streaming}
            className="text-xs font-medium text-orange-600 hover:text-orange-700 disabled:opacity-40"
          >
            New chat
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <div className="mx-auto mb-4 grid place-items-center h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100 ring-1 ring-orange-100 text-orange-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden>
                <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z" />
              </svg>
            </div>
            <p className="text-stone-600 font-medium">
              {problemContext ? 'Stuck on this one?' : 'Ask me anything about math!'}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {problemContext
                ? 'I can see the problem you\'re on. I\'ll help you work it out — not hand you the answer.'
                : 'I can explain concepts, graph functions, or work through problems with you.'}
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {(problemContext ? PROBLEM_SUGGESTIONS : SUGGESTIONS).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-sm px-3.5 py-2 rounded-full bg-white ring-1 ring-inset ring-stone-200 text-stone-600 hover:ring-orange-300 hover:text-stone-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-brand" aria-hidden>
                ∑
              </div>
            )}
            <div
              className={`rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'max-w-[80%] bg-orange-500 text-white rounded-tr-sm'
                  : 'max-w-[88%] bg-stone-50 text-stone-700 rounded-tl-sm'
              }`}
            >
              {msg.role === 'assistant' ? (
                msg.content ? (
                  <RichContent content={msg.content} />
                ) : streaming && i === messages.length - 1 ? (
                  '…'
                ) : (
                  ''
                )
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-stone-900/5 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder="Ask a math question…"
            aria-label="Ask a math question"
            className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-orange-400"
            disabled={streaming}
          />
          <Button onClick={() => send(input)} loading={streaming} size="sm">
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
