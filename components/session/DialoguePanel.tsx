'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ChatMessage } from '@/components/ChatMessage'
import { PracticeProblemCard } from '@/components/session/PracticeProblemCard'
import { Button } from '@/components/ui/Button'
import { LoadingDots } from '@/components/ui/LoadingDots'
import type { PracticeProblem } from '@/lib/ai/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  svg?: string
  problems?: PracticeProblem[]
}

interface DialoguePanelProps {
  sessionId: string
  initialMessages: Message[]
  onObjectiveComplete?: (id: string) => void
}

export function DialoguePanel({ sessionId, initialMessages, onObjectiveComplete }: DialoguePanelProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [pendingSvg, setPendingSvg] = useState<string | null>(null)
  const [pendingProblems, setPendingProblems] = useState<PracticeProblem[]>([])
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedImage(file)
    setImagePreviewUrl(URL.createObjectURL(file))
  }

  const clearImage = () => {
    setSelectedImage(null)
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImagePreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const send = useCallback(async () => {
    const content = input.trim()
    if (!content || streaming) return

    setInput('')
    setStreaming(true)
    setStreamingContent('')
    setPendingSvg(null)
    setPendingProblems([])

    // Convert image to base64 if present
    let imageBase64: string | undefined
    let imageMimeType: string | undefined
    const imageFile = selectedImage
    if (imageFile) {
      const buffer = await imageFile.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      bytes.forEach((b) => (binary += String.fromCharCode(b)))
      imageBase64 = btoa(binary)
      imageMimeType = imageFile.type
      clearImage()
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: imageFile ? `[Image attached] ${content}` : content,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, imageBase64, imageMimeType }),
      })

      if (!res.ok) throw new Error('Request failed')
      if (!res.body) throw new Error('No body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let finalSvg: string | undefined
      const finalProblems: PracticeProblem[] = []

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

              if (parsed.type === 'text') {
                fullText += parsed.text
                setStreamingContent(fullText)
              } else if (parsed.type === 'visual') {
                finalSvg = parsed.svg
                setPendingSvg(parsed.svg)
              } else if (parsed.type === 'objective_complete') {
                onObjectiveComplete?.(parsed.objectiveId)
              } else if (parsed.type === 'practice_problem') {
                finalProblems.push(parsed.problem)
                setPendingProblems((prev) => [...prev, parsed.problem])
              } else if (parsed.text) {
                // Legacy fallback
                fullText += parsed.text
                setStreamingContent(fullText)
              }
            } catch {
              // skip malformed
            }
          }
        }
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fullText,
        createdAt: new Date().toISOString(),
        svg: finalSvg,
        problems: finalProblems.length > 0 ? finalProblems : undefined,
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamingContent('')
      setPendingSvg(null)
      setPendingProblems([])
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
  }, [input, streaming, sessionId, selectedImage, onObjectiveComplete])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
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
          <div key={msg.id}>
            <ChatMessage role={msg.role} content={msg.content} />
            {msg.svg && (
              <div
                className="mt-2 ml-11 rounded-xl overflow-hidden border border-orange-100 bg-white"
                dangerouslySetInnerHTML={{ __html: msg.svg }}
              />
            )}
            {msg.problems && msg.problems.length > 0 && (
              <div className="mt-3 ml-11 space-y-3">
                {msg.problems.map((problem) => (
                  <PracticeProblemCard key={problem.id} problem={problem} sessionId={sessionId} />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Streaming state */}
        {streaming && streamingContent && (
          <div>
            <ChatMessage role="assistant" content={streamingContent} streaming />
            {pendingSvg && (
              <div
                className="mt-2 ml-11 rounded-xl overflow-hidden border border-orange-100 bg-white"
                dangerouslySetInnerHTML={{ __html: pendingSvg }}
              />
            )}
            {pendingProblems.length > 0 && (
              <div className="mt-3 ml-11 space-y-3">
                {pendingProblems.map((problem) => (
                  <PracticeProblemCard key={problem.id} problem={problem} sessionId={sessionId} />
                ))}
              </div>
            )}
          </div>
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
        {/* Image preview */}
        {imagePreviewUrl && (
          <div className="mb-3 flex items-center gap-2">
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreviewUrl}
                alt="Selected"
                className="h-16 w-16 object-cover rounded-lg border border-orange-200"
              />
              <button
                onClick={clearImage}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-stone-700 text-white text-xs flex items-center justify-center hover:bg-stone-900"
              >
                ×
              </button>
            </div>
            <span className="text-xs text-stone-400">Image will be sent with your message</span>
          </div>
        )}

        <div className="flex gap-2 items-end">
          {/* Camera button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
            className="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl border border-stone-200 text-stone-400 hover:text-orange-500 hover:border-orange-300 transition-colors disabled:opacity-40"
            title="Upload image of handwritten math"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />

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
