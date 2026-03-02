'use client'

import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { StudentChatPanel } from '@/components/chat/StudentChatPanel'

export default function ChatPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
  }, [user, loading, router])

  return (
    <div className="h-screen flex flex-col bg-[#FFFBF5]">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full flex flex-col overflow-hidden">
        <StudentChatPanel />
      </main>
    </div>
  )
}
