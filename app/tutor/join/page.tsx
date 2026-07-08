'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/Button'

function JoinForm() {
  const { user, loading, refresh } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const c = searchParams.get('code')
    if (c) setCode(c.toUpperCase())
  }, [searchParams])

  // Must be logged in to accept. Middleware protects /tutor, but guard anyway.
  useEffect(() => {
    if (!loading && !user) {
      const c = searchParams.get('code')
      router.push(`/auth?next=${encodeURIComponent(`/tutor/join${c ? `?code=${c}` : ''}`)}`)
    }
  }, [user, loading, router, searchParams])

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/tutor-invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not accept this invite')
        return
      }
      setDone(true)
      await refresh()
      setTimeout(() => router.push('/dashboard'), 1200)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 grid place-items-center h-14 w-14 rounded-2xl bg-green-100 text-green-600 ring-1 ring-green-200">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-7 w-7" aria-hidden>
            <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-stone-900">You&apos;re a tutor now!</h1>
        <p className="text-stone-600 mt-1">Taking you to your dashboard…</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 text-center">Become a tutor</h1>
      <p className="text-stone-600 mt-2 mb-6 text-center">
        Enter your tutor invite code to activate your tutor account.
      </p>
      <form onSubmit={redeem} className="space-y-4">
        <label htmlFor="tutor-code" className="sr-only">Tutor invite code</label>
        <input
          id="tutor-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7QMP2XR"
          autoCapitalize="characters"
          className="w-full px-4 py-3 rounded-xl bg-white text-center text-lg font-mono tracking-widest ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 ring-1 ring-inset ring-red-200 rounded-xl px-3 py-2">{error}</p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={submitting} disabled={!code.trim()}>
          Activate tutor account
        </Button>
      </form>
      <p className="text-center mt-4">
        <Link href="/dashboard" className="text-sm text-stone-500 hover:text-stone-700">Back to dashboard</Link>
      </p>
    </div>
  )
}

export default function TutorJoinPage() {
  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-3xl ring-1 ring-stone-900/5 shadow-elevated p-6 sm:p-8">
          <Suspense fallback={<div className="h-64 animate-pulse bg-stone-100 rounded-2xl" />}>
            <JoinForm />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
