'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'

export function Navbar() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.push('/')
  }

  const isStudent = user?.role === 'STUDENT'

  return (
    <nav className="sticky top-0 z-50 bg-[#FFFBF5]/70 backdrop-blur-xl border-b border-stone-900/5">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="grid place-items-center h-8 w-8 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white text-lg font-bold shadow-brand transition-transform duration-200 group-hover:scale-105">
            ∑
          </span>
          <span className="text-lg font-bold tracking-tight text-stone-900">Socra</span>
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">Dashboard</Button>
              </Link>
              {isStudent && (
                <>
                  <Link href="/student/practice">
                    <Button variant="ghost" size="sm">Homework</Button>
                  </Link>
                  <Link href="/student/progress">
                    <Button variant="ghost" size="sm">Progress</Button>
                  </Link>
                  <Link href="/student/chat">
                    <Button variant="ghost" size="sm">Chat</Button>
                  </Link>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link href="/auth">
                <Button variant="ghost" size="sm">Log In</Button>
              </Link>
              <Link href="/auth">
                <Button size="sm">Get Started</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
