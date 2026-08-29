'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'

function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

function VerifyForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refresh } = useAuth()

  const email = searchParams.get('email') || ''
  const next = safeNext(searchParams.get('next'))

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [resent, setResent] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // No email in the URL — nothing to verify.
  useEffect(() => {
    if (!email) router.replace('/auth')
  }, [email, router])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const startCooldown = () => {
    setCooldown(30)
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && timerRef.current) { clearInterval(timerRef.current); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // The account is already verified (this code was accepted by an earlier
        // attempt whose response we never saw). Nothing is wrong — they just
        // need to sign in, so send them there instead of leaving them on a form
        // that can no longer succeed.
        if (data.alreadyVerified) {
          router.replace(`/auth${next ? `?next=${encodeURIComponent(next)}` : ''}`)
          return
        }
        setError(data.error || 'Could not verify. Please try again.')
        return
      }
      await refresh()
      if (next) {
        router.push(next)
      } else if (data.user?.role === 'PARENT') {
        router.push('/parent/dashboard')
      } else {
        const profile = data.user?.studentProfile
        router.push(profile && !profile.onboardingDone ? '/onboarding' : '/dashboard')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (cooldown > 0) return
    setError('')
    setResent(false)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setResent(true)
      startCooldown()
    } catch {
      setError('Could not resend. Please try again.')
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 text-center">Verify your email</h1>
      <p className="text-stone-600 mt-2 mb-6 text-center">
        We sent a 6-digit code to <span className="font-medium text-stone-900">{email}</span>. Enter it below.
      </p>

      <form onSubmit={verify} className="space-y-4">
        <label htmlFor="code" className="sr-only">6-digit code</label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="w-full px-4 py-3 rounded-xl bg-white text-center text-2xl font-mono tracking-[0.5em] ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 ring-1 ring-inset ring-red-200 rounded-xl px-3 py-2">{error}</p>}
        {resent && !error && <p className="text-sm text-green-700 bg-green-50 ring-1 ring-inset ring-green-200 rounded-xl px-3 py-2">A new code is on its way.</p>}
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={code.length !== 6}>
          Verify & continue
        </Button>
      </form>

      <div className="text-center mt-4 text-sm text-stone-500">
        Didn&apos;t get it?{' '}
        <button
          onClick={resend}
          disabled={cooldown > 0}
          className="font-medium text-orange-600 hover:text-orange-700 disabled:text-stone-400"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
      <p className="text-center mt-3">
        <Link href="/auth" className="text-sm text-stone-400 hover:text-stone-600">Back to sign in</Link>
      </p>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col">
      <div className="p-4">
        <Link href="/" className="flex items-center gap-2.5 w-fit">
          <span className="grid place-items-center h-8 w-8 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white text-lg font-bold shadow-brand">∑</span>
          <span className="text-lg font-bold tracking-tight text-stone-900">Socra</span>
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-3xl ring-1 ring-stone-900/5 shadow-elevated p-6 sm:p-8">
          <Suspense fallback={<div className="h-64 animate-pulse bg-stone-100 rounded-2xl" />}>
            <VerifyForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
