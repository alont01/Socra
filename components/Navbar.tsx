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
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-orange-100">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-orange-500">∑</span>
          <span className="text-xl font-bold text-stone-900">Socra</span>
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
                    <Button variant="ghost" size="sm">Practice</Button>
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
