'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'

type Tab = 'login' | 'signup'
type Role = 'STUDENT' | 'PARENT'

function AuthForm() {
  const [tab, setTab] = useState<Tab>('login')
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
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-stone-900">
          {tab === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="text-stone-500 mt-2">
          {tab === 'signup' ? 'Start your personalized math journey' : 'Continue your learning journey'}
        </p>
      </div>

      {/* OAuth buttons */}
      <div className="space-y-3 mb-6">
        <button
          onClick={() => signIn('google', { callbackUrl: '/api/auth/complete' })}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border-2 border-stone-200 bg-white text-stone-700 font-medium hover:border-stone-300 hover:bg-stone-50 transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <button
          onClick={() => signIn('github', { callbackUrl: '/api/auth/complete' })}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border-2 border-stone-800 bg-stone-900 text-white font-medium hover:bg-stone-800 transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
          Continue with GitHub
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-stone-200" />
        <span className="text-sm text-stone-400">or</span>
        <div className="flex-1 h-px bg-stone-200" />
      </div>

      {/* Tabs */}
      <div className="flex bg-stone-100 rounded-xl p-1 mb-6">
        {(['login', 'signup'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError('') }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {t === 'login' ? 'Log In' : 'Sign Up'}
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
          {tab === 'login' ? 'Log In' : 'Create Account'}
        </Button>
      </form>
    </div>
  )
}

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col">
      <div className="p-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <span className="text-2xl font-bold text-orange-500">∑</span>
          <span className="text-xl font-bold text-stone-900">Socra</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <Suspense fallback={<div className="w-full max-w-sm h-96 animate-pulse bg-white rounded-2xl border border-orange-100" />}>
          <AuthForm />
        </Suspense>
      </div>
    </div>
  )
}
