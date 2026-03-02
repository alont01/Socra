'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { MasteryChart } from '@/components/progress/MasteryChart'
import { LoadingDots } from '@/components/ui/LoadingDots'

interface ProgressItem {
  topic: string
  mastery: number
  updatedAt: string
}

export default function ProgressPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [progress, setProgress] = useState<ProgressItem[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    fetch('/api/student/progress')
      .then((r) => r.json())
      .then((data) => setProgress(data.progress || []))
      .finally(() => setFetching(false))
  }, [user])

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-stone-900 mb-6">My Progress</h1>

        {fetching ? (
          <div className="flex justify-center py-12"><LoadingDots /></div>
        ) : (
          <MasteryChart progress={progress} />
        )}
      </main>
    </div>
  )
}
