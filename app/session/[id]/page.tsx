'use client'

import { use, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { SessionHeader } from '@/components/session/SessionHeader'
import { TopicPanel } from '@/components/session/TopicPanel'
import { DialoguePanel } from '@/components/session/DialoguePanel'
import { LoadingDots } from '@/components/ui/LoadingDots'

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

  if (authLoading || sessionLoading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <LoadingDots />
      </div>
    )
  }

  if (!session) return null

  const mathTopics = session.student?.mathTopics
    ? JSON.parse(session.student.mathTopics)
    : user?.studentProfile?.mathTopics
    ? JSON.parse(user.studentProfile.mathTopics)
    : []

  return (
    <div className="h-screen flex flex-col bg-[#FFFBF5] overflow-hidden">
      <SessionHeader title={session.title} topic={session.topic} />

      <div className="flex flex-1 overflow-hidden">
        <TopicPanel
          topic={session.topic}
          studentName={session.student?.name}
          gradeLevel={session.student?.gradeLevel}
          mathTopics={mathTopics}
        />
        <DialoguePanel sessionId={id} initialMessages={session.messages} />
      </div>
    </div>
  )
}
