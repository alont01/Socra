'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'

type Tab = 'login' | 'signup'
// Public signup is Student or Parent only. Tutor accounts are created by
// redeeming an admin-issued invite (/tutor/join).
type Role = 'STUDENT' | 'PARENT'

// Only allow same-origin relative redirects to avoid open-redirect abuse.
function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

function AuthForm() {
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get('next'))
  // An invite link routes here as ?next=/parent/join... — default to the parent
  // role in that case so a new parent lands in the right flow.
  const parentHint = searchParams.get('role') === 'parent' || (next?.startsWith('/parent') ?? false)
  const [tab, setTab] = useState<Tab>('login')
  const [role, setRole] = useState<Role>(parentHint ? 'PARENT' : 'STUDENT')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { refresh } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (tab === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

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

      // New signup, or login on an unverified account → go verify the email.
      if (data.needsVerification) {
        const params = new URLSearchParams({ email: (data.email as string) || email })
        if (next) params.set('next', next)
        router.push(`/auth/verify?${params.toString()}`)
        return
      }

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        return
      }

      await refresh()

      // An explicit next (e.g. an invite link) always wins.
      if (next) {
        router.push(next)
      } else if (tab === 'signup') {
        if (role === 'PARENT') {
          router.push('/parent/dashboard')
        } else {
          router.push('/onboarding')
        }
      } else if (data.user?.role === 'PARENT') {
        router.push('/parent/dashboard')
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
    <div className="w-full">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">
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
            onClick={() => { setTab(t); setError(''); setConfirmPassword('') }}
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
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Account type">
                {(['STUDENT', 'PARENT'] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={role === r}
                    onClick={() => setRole(r)}
                    className={`py-3 rounded-xl border-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                      role === r
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-stone-200 text-stone-600 hover:border-orange-300'
                    }`}
                  >
                    {r === 'STUDENT' ? 'Student' : 'Parent'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <Input
          label={tab === 'login' ? 'Email or username' : 'Email'}
          type={tab === 'login' ? 'text' : 'email'}
          placeholder={tab === 'login' ? 'you@example.com or username' : 'you@example.com'}
          autoCapitalize={tab === 'login' ? 'none' : undefined}
          autoCorrect={tab === 'login' ? 'off' : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div>
          <Input
            label="Password"
            type="password"
            placeholder={tab === 'signup' ? 'At least 8 characters' : 'Your password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={tab === 'signup' ? 8 : undefined}
          />
          {tab === 'login' && (
            <div className="mt-1 text-right">
              <a
                href="/auth/forgot-password"
                className="text-xs text-orange-500 hover:text-orange-600 transition-colors"
              >
                Forgot password?
              </a>
            </div>
          )}
        </div>

        {tab === 'signup' && (
          <Input
            label="Confirm Password"
            type="password"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        )}

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

const brandBullets = [
  'AI analyzes every session — automatically',
  'Targeted practice built from real gaps',
  'Progress that compounds session over session',
]

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] lg:grid lg:grid-cols-2">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 p-12 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 -left-16 h-80 w-80 rounded-full bg-white/15 blur-3xl animate-float-slow" />
          <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-amber-300/30 blur-3xl animate-float-slow [animation-delay:-5s]" />
          <div className="absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        </div>

        <Link href="/" className="relative flex items-center gap-2.5 w-fit">
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-white/15 backdrop-blur text-white text-lg font-bold ring-1 ring-white/25">∑</span>
          <span className="text-lg font-bold tracking-tight">Socra</span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold tracking-tight leading-[1.1] mb-5">
            Tutoring that gets smarter every session.
          </h2>
          <p className="text-orange-50/90 text-lg mb-8">
            Run the session — Socra handles summaries, practice, and progress the moment it ends.
          </p>
          <ul className="space-y-3">
            {brandBullets.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="mt-0.5 grid place-items-center h-5 w-5 rounded-full bg-white/20 ring-1 ring-white/30 shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3 w-3">
                    <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-orange-50">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-orange-50/70 text-sm">&copy; 2026 Socra</p>
      </aside>

      {/* Form side */}
      <main className="flex flex-col min-h-screen lg:min-h-0">
        <div className="p-4 lg:hidden">
          <Link href="/" className="flex items-center gap-2.5 w-fit">
            <span className="grid place-items-center h-8 w-8 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white text-lg font-bold shadow-brand">∑</span>
            <span className="text-lg font-bold tracking-tight text-stone-900">Socra</span>
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <div className="bg-white/80 backdrop-blur rounded-3xl ring-1 ring-stone-900/5 shadow-elevated p-6 sm:p-8">
              <Suspense fallback={<div className="w-full h-96 animate-pulse bg-stone-100 rounded-2xl" />}>
                <AuthForm />
              </Suspense>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
