'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'

export function Navbar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const handleLogout = async () => {
    // logout() clears client state synchronously (instant UI) and awaits the
    // cookie-clear. We must wait for the cookie to actually clear before going
    // to /auth — middleware redirects any request with a valid token cookie
    // away from /auth to /dashboard, so navigating too early bounces us back.
    // That wait is a real (if brief) network round-trip, so show a loading
    // state on the button — otherwise the click looks like it did nothing.
    setSigningOut(true)
    await logout()
    router.replace('/auth')
  }

  const isStudent = user?.role === 'STUDENT'
  const isParent = user?.role === 'PARENT'
  const isTutor = user?.role === 'TUTOR'

  return (
    <nav className="sticky top-0 z-50 bg-[#FFFBF5]/70 backdrop-blur-xl border-b border-stone-900/5">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <span className="grid place-items-center h-8 w-8 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white text-lg font-bold shadow-brand transition-transform duration-200 group-hover:scale-105">
            ∑
          </span>
          <span className="text-lg font-bold tracking-tight text-stone-900">Socra</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-3 ml-auto min-w-0 overflow-x-auto no-scrollbar [&>*]:shrink-0">
          {user ? (
            <>
              <Link href={isParent ? '/parent/dashboard' : '/dashboard'}>
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
              {isTutor && (
                <Link href="/tutor/availability">
                  <Button variant="ghost" size="sm">Availability</Button>
                </Link>
              )}
              <Link href="/settings">
                <Button variant="ghost" size="sm">Settings</Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout} loading={signingOut}>
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link href="/auth">
                <Button variant="ghost" size="sm">Log In</Button>
              </Link>
              <Link href="/get-started">
                <Button size="sm">Get Started</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
