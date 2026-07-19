'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { MasteryChart } from '@/components/progress/MasteryChart'
import { MasteryTrend, type TrendPoint } from '@/components/progress/MasteryTrend'
import { Skeleton } from '@/components/ui/Skeleton'

interface ProgressItem {
  topic: string
  mastery: number
  updatedAt: string
}

export default function ProgressPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [progress, setProgress] = useState<ProgressItem[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    fetch('/api/student/progress')
      .then((r) => r.json())
      .then((data) => {
        setProgress(data.progress || [])
        setTrend(data.trend || [])
      })
      .finally(() => setFetching(false))
  }, [user])

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-stone-900 mb-6">My Progress</h1>

        {fetching ? (
          <div className="space-y-6">
            <Skeleton className="h-64 rounded-3xl" />
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 rounded-3xl" />
              <Skeleton className="h-24 rounded-3xl" />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <MasteryTrend points={trend} />
            <div>
              <h2 className="text-lg font-bold text-stone-900 mb-3">Topic mastery</h2>
              <MasteryChart progress={progress} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
