'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ChatMessage } from '@/components/ChatMessage'
import { Button } from '@/components/ui/Button'
import { LoadingDots } from '@/components/ui/LoadingDots'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface DialoguePanelProps {
  sessionId: string
  initialMessages: Message[]
}

export function DialoguePanel({ sessionId, initialMessages }: DialoguePanelProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const send = useCallback(async () => {
    const content = input.trim()
    if (!content || streaming) return

    setInput('')
    setStreaming(true)
    setStreamingContent('')

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) throw new Error('Request failed')
      if (!res.body) throw new Error('No body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                fullText += parsed.text
                setStreamingContent(fullText)
              }
            } catch {
              // skip
            }
          }
        }
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fullText,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamingContent('')
    } catch (err) {
      console.error(err)
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "I'm having trouble connecting. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ])
    } finally {
      setStreaming(false)
      textareaRef.current?.focus()
    }
  }, [input, streaming, sessionId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <div className="text-5xl mb-4">∑</div>
              <h3 className="font-semibold text-stone-900 mb-2">Ready to explore math?</h3>
              <p className="text-stone-500 text-sm">
                Ask a question, share a problem you&apos;re working on, or tell me what topic you&apos;d like to practice.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {streaming && streamingContent && (
          <ChatMessage role="assistant" content={streamingContent} streaming />
        )}

        {streaming && !streamingContent && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
              ∑
            </div>
            <div className="bg-white border border-orange-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
              <LoadingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-orange-100 bg-white p-4">
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            className="flex-1 px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400 text-stone-900 placeholder-stone-400 resize-none text-sm bg-white"
            placeholder="Ask a question or share a problem… (Enter to send, Shift+Enter for new line)"
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            rows={1}
            style={{ minHeight: '44px', maxHeight: '160px' }}
            disabled={streaming}
          />
          <Button onClick={send} disabled={!input.trim() || streaming} className="shrink-0 h-11">
            Send →
          </Button>
        </div>
      </div>
    </div>
  )
}
