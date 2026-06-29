'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { PracticeSetCard } from '@/components/practice/PracticeSetCard'
import { LoadingDots } from '@/components/ui/LoadingDots'

interface PracticeSetSummary {
  id: string
  title: string
  topic: string
  problemCount: number
  completedCount: number
  createdAt: string
}

export default function PracticePage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [sets, setSets] = useState<PracticeSetSummary[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    fetch('/api/student/practice')
      .then((r) => r.json())
      .then((data) => setSets(data.practiceSets || []))
      .finally(() => setFetching(false))
  }, [user])

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-stone-900 mb-6">Homework</h1>

        {fetching ? (
          <div className="flex justify-center py-12"><LoadingDots /></div>
        ) : sets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-8 text-center">
            <p className="text-stone-500">No homework assigned yet. Your tutor will assign sets after your sessions!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sets.map((s) => (
              <PracticeSetCard key={s.id} {...s} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
