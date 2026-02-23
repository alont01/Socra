'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Wizard, type WizardEmotion } from '@/components/character/Wizard'
import { Button } from '@/components/ui/Button'

interface ConvMessage {
  role: 'user' | 'assistant'
  content: string
}

const ARCHIE_GREETING =
  "Hi! I'm Archie, your magical math guide! ✨ I'm so excited to help you learn math in a way that's just right for you. First things first — what's your name?"

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  // Redirect parents (they don't do the student onboarding)
  useEffect(() => {
    if (!authLoading && user?.role === 'PARENT') {
      router.replace('/dashboard')
    }
  }, [user, authLoading, router])

  const [messages, setMessages] = useState<ConvMessage[]>([
    { role: 'assistant', content: ARCHIE_GREETING },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [wizardEmotion, setWizardEmotion] = useState<WizardEmotion>('idle')
  const [phase, setPhase] = useState<'interview' | 'complete'>('interview')

  const historyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Scroll history to bottom whenever messages update
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight
    }
  }, [messages])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading || phase === 'complete') return

    setInput('')
    setLoading(true)
    setWizardEmotion('thinking')

    const updatedMessages: ConvMessage[] = [
      ...messages,
      { role: 'user', content: text },
    ]
    setMessages(updatedMessages)

    try {
      const res = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')

      const newPhase = data.phase as 'interview' | 'complete'
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply },
      ])

      if (newPhase === 'complete') {
        setPhase('complete')
        setWizardEmotion('celebrate')
        setTimeout(() => router.push('/dashboard'), 3000)
      } else {
        setWizardEmotion('idle')
      }
    } catch (err) {
      console.error(err)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Hmm, my magic seems to be acting up! 🪄 Could you try that again?",
        },
      ])
      setWizardEmotion('idle')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, messages, phase, router])

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
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  // Latest assistant message shown in the speech bubble near Archie
  const latestAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')
  // All but the latest assistant message go in the history scroll area
  const historyMessages = messages.slice(0, -1)

  if (authLoading) return null

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col">
      {/* Header */}
      <header className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-orange-100 bg-white/80 backdrop-blur-sm">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-orange-500">∑</span>
          <span className="text-xl font-bold text-stone-900">Socra</span>
        </Link>
        <span className="text-sm text-stone-400">
          {phase === 'complete' ? '✨ All done!' : 'Getting to know you…'}
        </span>
      </header>

      {/* Main layout — chat interface */}
      <div className="flex-1 flex flex-col max-w-xl mx-auto w-full overflow-hidden">

        {/* Archie + speech bubble */}
        <div className="shrink-0 flex flex-col items-center gap-4 pt-8 pb-4 px-4">
          <Wizard emotion={wizardEmotion} size="lg" />

          {/* Speech bubble for latest Archie message */}
          {latestAssistantMsg && (
            <div className="relative bg-white border border-purple-200 rounded-2xl rounded-t-sm shadow-sm px-4 py-3 max-w-sm w-full">
              {/* Triangle pointer */}
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 overflow-hidden">
                <div className="w-3 h-3 bg-white border-l border-t border-purple-200 rotate-45 translate-x-0.5 translate-y-1.5" />
              </div>
              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
                {loading && messages[messages.length - 1]?.role === 'user'
                  ? null
                  : latestAssistantMsg.content}
              </p>
              {loading && (
                <span className="inline-flex gap-1 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
          )}
        </div>

        {/* Conversation history (previous turns) */}
        {historyMessages.length > 1 && (
          <div
            ref={historyRef}
            className="flex-1 overflow-y-auto px-4 pb-2 flex flex-col gap-2 min-h-0"
          >
            {historyMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-orange-500 text-white rounded-tr-sm'
                      : 'bg-purple-50 text-stone-700 border border-purple-100 rounded-tl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Spacer when no history yet */}
        {historyMessages.length <= 1 && <div className="flex-1" />}

        {/* Input area */}
        <div className="shrink-0 border-t border-orange-100 bg-white p-4">
          {phase === 'complete' ? (
            <div className="text-center py-2">
              <p className="text-sm text-stone-500">Building your personalized plan… ✨</p>
              <p className="text-xs text-stone-400 mt-1">Heading to your dashboard in a moment</p>
            </div>
          ) : (
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                className="flex-1 px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-purple-400 text-stone-900 placeholder-stone-400 resize-none text-sm bg-white"
                placeholder="Type your answer… (Enter to send)"
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                rows={1}
                style={{ minHeight: '44px', maxHeight: '120px' }}
                disabled={loading}
                autoFocus
              />
              <Button
                onClick={send}
                disabled={!input.trim() || loading}
                className="shrink-0 h-11 bg-purple-600 hover:bg-purple-700"
              >
                →
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
