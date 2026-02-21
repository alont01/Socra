'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'

type Tab = 'login' | 'signup'
type Role = 'STUDENT' | 'PARENT'

export default function AuthPage() {
  const [tab, setTab] = useState<Tab>('signup')
  const [role, setRole] = useState<Role>('STUDENT')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { refresh } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = tab === 'signup' ? '/api/auth/signup' : '/api/auth/login'
      const body = tab === 'signup' ? { email, password, role, name } : { email, password }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        return
      }

      await refresh()

      if (tab === 'signup') {
        router.push('/onboarding')
      } else {
        const profile = data.user?.studentProfile
        if (profile && !profile.onboardingDone) {
          router.push('/onboarding')
        } else {
          router.push('/dashboard')
        }
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col">
      {/* Simple header */}
      <div className="p-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <span className="text-2xl font-bold text-orange-500">∑</span>
          <span className="text-xl font-bold text-stone-900">Socra</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-stone-900">
              {tab === 'signup' ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="text-stone-500 mt-2">
              {tab === 'signup'
                ? 'Start your personalized math journey'
                : 'Continue your learning journey'}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex bg-stone-100 rounded-xl p-1 mb-6">
            {(['signup', 'login'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {t === 'signup' ? 'Sign Up' : 'Log In'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'signup' && (
              <>
                <Input
                  label="Full Name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />

                {/* Role selection */}
                <div>
                  <label className="text-sm font-medium text-stone-700 block mb-2">I am a…</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['STUDENT', 'PARENT'] as Role[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          role === r
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-stone-200 text-stone-600 hover:border-orange-300'
                        }`}
                      >
                        {r === 'STUDENT' ? '🎓 Student' : '👨‍👩‍👧 Parent'}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder={tab === 'signup' ? 'At least 8 characters' : 'Your password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={tab === 'signup' ? 8 : undefined}
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              {tab === 'signup' ? 'Create Account' : 'Log In'}
            </Button>
          </form>

          <p className="text-center text-stone-500 text-sm mt-6">
            {tab === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button
              onClick={() => { setTab(tab === 'signup' ? 'login' : 'signup'); setError('') }}
              className="text-orange-600 font-medium hover:underline"
            >
              {tab === 'signup' ? 'Log In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
