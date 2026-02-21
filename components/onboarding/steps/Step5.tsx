'use client'

import { useEffect, useState, useRef } from 'react'
import { LoadingDots } from '@/components/ui/LoadingDots'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

interface LearningPlan {
  overview: string
  weeks: Array<{
    week: number
    theme: string
    topics: string[]
    goals: string[]
    dailySessions: number
  }>
  focusAreas: string[]
  encouragement: string
}

interface Step5Props {
  profileData: {
    name: string
    gradeLevel: string
    mathTopics: string[]
    strengthAreas: string[]
    weaknessAreas: string[]
    learningStyle: string
    goals: string
  }
}

export function Step5({ profileData }: Step5Props) {
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [plan, setPlan] = useState<LearningPlan | null>(null)
  const [streamText, setStreamText] = useState('')
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const generate = async () => {
      try {
        const res = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profileData),
        })

        if (!res.ok) {
          setStatus('error')
          return
        }

        const reader = res.body!.getReader()
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
                  setStreamText(fullText)
                }
              } catch {
                // skip
              }
            }
          }
        }

        const jsonMatch = fullText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          setPlan(JSON.parse(jsonMatch[0]))
        }
        setStatus('done')
      } catch {
        setStatus('error')
      }
    }

    generate()
  }, [profileData])

  if (status === 'error') {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">😕</div>
        <p className="text-stone-600">Something went wrong generating your plan.</p>
        <Link href="/dashboard">
          <Button>Go to Dashboard</Button>
        </Link>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="text-center space-y-6">
        <div className="text-5xl animate-bounce">✨</div>
        <div>
          <h2 className="text-2xl font-bold text-stone-900 mb-2">
            Creating your learning plan…
          </h2>
          <p className="text-stone-500">This takes just a moment</p>
        </div>
        <LoadingDots />
        {streamText && (
          <div className="text-xs text-stone-400 max-h-24 overflow-hidden text-left bg-stone-50 rounded-xl p-3 font-mono">
            {streamText.slice(-200)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-stone-900">Your plan is ready!</h2>
        {plan?.encouragement && (
          <p className="text-stone-600 mt-2 italic">&ldquo;{plan.encouragement}&rdquo;</p>
        )}
      </div>

      {plan && (
        <>
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <p className="text-stone-700 text-sm">{plan.overview}</p>
          </div>

          <div className="space-y-3">
            {plan.weeks.slice(0, 2).map((week) => (
              <div key={week.week} className="bg-white rounded-xl border border-orange-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    Week {week.week}
                  </span>
                  <span className="font-semibold text-stone-900 text-sm">{week.theme}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {week.topics.map((t) => (
                    <span key={t} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {plan.weeks.length > 2 && (
              <p className="text-xs text-stone-400 text-center">
                + {plan.weeks.length - 2} more weeks on your dashboard
              </p>
            )}
          </div>
        </>
      )}

      <Link href="/dashboard" className="block">
        <Button className="w-full" size="lg">
          Start Learning! →
        </Button>
      </Link>
    </div>
  )
}
