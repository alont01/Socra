'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { SessionHeader } from '@/components/session/SessionHeader'
import { LessonPanel } from '@/components/session/LessonPanel'
import { DialoguePanel } from '@/components/session/DialoguePanel'
import { LoadingDots } from '@/components/ui/LoadingDots'
import type { LessonObjective } from '@/lib/ai/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface Session {
  id: string
  title: string
  topic: string
  messages: Message[]
  student?: {
    name: string
    gradeLevel: string
    mathTopics: string
  } | null
}

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [objectives, setObjectives] = useState<LessonObjective[]>([])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/sessions/${id}`)
        if (res.ok) {
          const data = await res.json()
          setSession(data.session)
        } else if (res.status === 404) {
          router.push('/dashboard')
        }
      } finally {
        setSessionLoading(false)
      }
    }

    if (user && id) fetchSession()
  }, [user, id, router])

  // Poll for objectives (fire-and-forget generation in sessions POST)
  useEffect(() => {
    if (!user || !id) return

    let attempts = 0
    const maxAttempts = 6

    const poll = async () => {
      try {
        const res = await fetch(`/api/sessions/${id}/objectives`)
        if (res.ok) {
          const data = await res.json()
          if (data.objectives?.length > 0) {
            setObjectives(
              data.objectives.map((o: {
                id: string
                title: string
                description: string
                order: number
                completed: boolean
                completedAt: string | null
              }) => ({
                id: o.id,
                title: o.title,
                description: o.description,
                order: o.order,
                completed: o.completed,
                completedAt: o.completedAt,
              }))
            )
            return // done
          }
        }
      } catch {
        // ignore
      }

      attempts++
      if (attempts < maxAttempts) {
        setTimeout(poll, 1500)
      }
    }

    // Start polling after short delay to allow generation to complete
    const timer = setTimeout(poll, 800)
    return () => clearTimeout(timer)
  }, [user, id])

  const handleObjectiveComplete = useCallback((objectiveId: string) => {
    setObjectives((prev) =>
      prev.map((o) =>
        o.id === objectiveId
          ? { ...o, completed: true, completedAt: new Date().toISOString() }
          : o
      )
    )
  }, [])

  if (authLoading || sessionLoading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <LoadingDots />
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="h-screen flex flex-col bg-[#FFFBF5] overflow-hidden">
      <SessionHeader title={session.title} topic={session.topic} />

      <div className="flex flex-1 overflow-hidden">
        <LessonPanel
          topic={session.topic}
          studentName={session.student?.name}
          gradeLevel={session.student?.gradeLevel}
          objectives={objectives}
        />
        <DialoguePanel
          sessionId={id}
          initialMessages={session.messages}
          onObjectiveComplete={handleObjectiveComplete}
        />
      </div>
    </div>
  )
}
