'use client'

import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { TutorDashboard } from '@/components/dashboard/TutorDashboard'
import { StudentDashboard } from '@/components/dashboard/StudentDashboard'
import { LoadingDots } from '@/components/ui/LoadingDots'

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth')
    } else if (!loading && user?.role === 'PARENT') {
      router.replace('/parent/dashboard')
    }
  }, [user, loading, router])

  // Parents are redirected to their own dashboard by the effect above, but the
  // redirect isn't instant — rendering on through showed them a flash of the
  // student dashboard (with someone else's headings) on the way out.
  if (loading || !user || user.role === 'PARENT') {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <LoadingDots />
      </div>
    )
  }

  const isTutor = user.role === 'TUTOR'

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {isTutor ? (
          <TutorDashboard
            tutorName={user?.tutorProfile?.name || 'there'}
          />
        ) : (
          <StudentDashboard
            studentName={user?.studentProfile?.name || 'there'}
            goals={user?.studentProfile?.goals || ''}
          />
        )}
      </main>
    </div>
  )
}
