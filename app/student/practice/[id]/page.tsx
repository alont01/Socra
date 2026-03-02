'use client'

import { use, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { PracticeWorkspace } from '@/components/practice/PracticeWorkspace'
import { LoadingDots } from '@/components/ui/LoadingDots'
import Link from 'next/link'

interface Problem {
  id: string
  question: string
  hint: string
  difficulty: string
  topic: string
  answer?: string
}

interface Attempt {
  problemIndex: number
  studentAnswer: string
  correct: boolean | null
}

export default function PracticeSetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { user, loading } = useAuth()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [problems, setProblems] = useState<Problem[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
  }, [user, loading, router])

  useEffect(() => {
    if (!user || !id) return
    fetch(`/api/student/practice/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.practiceSet) {
          setTitle(data.practiceSet.title)
          setProblems(data.practiceSet.problems)
          setAttempts(data.practiceSet.attempts || [])
        }
      })
      .finally(() => setFetching(false))
  }, [user, id])

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-stone-900">{title || 'Practice Set'}</h1>
          <Link href="/student/practice" className="text-sm text-orange-500 hover:text-orange-600">
            Back to Practice
          </Link>
        </div>

        {fetching ? (
          <div className="flex justify-center py-12"><LoadingDots /></div>
        ) : problems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-8 text-center">
            <p className="text-stone-500">No problems in this set.</p>
          </div>
        ) : (
          <PracticeWorkspace
            practiceSetId={id}
            problems={problems}
            existingAttempts={attempts}
          />
        )}
      </main>
    </div>
  )
}
