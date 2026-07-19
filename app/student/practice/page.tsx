'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { PracticeSetCard } from '@/components/practice/PracticeSetCard'
import { Skeleton } from '@/components/ui/Skeleton'

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
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    fetch('/api/student/practice')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setSets(data.practiceSets || []))
      .catch(() => setError(true))
      .finally(() => setFetching(false))
  }, [user])

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-stone-900 mb-6">Homework</h1>

        {fetching ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-3xl" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-8 text-center">
            <p className="text-stone-500 mb-3">Couldn&apos;t load your homework.</p>
            <button
              onClick={() => { setError(false); setFetching(true); location.reload() }}
              className="text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              Try again
            </button>
          </div>
        ) : sets.length === 0 ? (
          <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-8 text-center">
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
