'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

export interface AuthUser {
  id: string
  email: string
  role: string
  studentProfile?: {
    id: string
    name: string
    gradeLevel: string
    onboardingDone: boolean
    learningPlan: string
    mathTopics: string
    goals: string
  } | null
  parentProfile?: {
    id: string
    name: string
    children: Array<{
      id: string
      name: string
      gradeLevel: string
      onboardingDone: boolean
      sessionsCount: number
      mathTopics: string
    }>
  } | null
  tutorProfile?: {
    id: string
    name: string
    specialties: string
    bio: string
  } | null
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    // Clear client state synchronously so redirects (e.g. the landing page,
    // which bounces logged-in users to /dashboard) see a logged-out user
    // immediately. The cookie-clearing request completes in the background.
    setUser(null)
    try {
      // keepalive so the request still completes if the page navigates away.
      await fetch('/api/auth/logout', { method: 'POST', keepalive: true })
    } catch {
      // Best-effort — state is already cleared and we're navigating away.
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  return useContext(AuthContext)
}
