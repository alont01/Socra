'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/Button'

function JoinForm() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [linkedName, setLinkedName] = useState('')

  // Prefill from ?code= (invite link).
  useEffect(() => {
    const c = searchParams.get('code')
    if (c) setCode(c.toUpperCase())
  }, [searchParams])

  // Non-parents shouldn't be here. Send them to auth (to sign up as a parent).
  useEffect(() => {
    if (!loading && !user) {
      const c = searchParams.get('code')
      router.push(`/auth${c ? `?next=${encodeURIComponent(`/parent/join?code=${c}`)}` : ''}`)
    } else if (!loading && user && user.role !== 'PARENT') {
      router.replace('/dashboard')
    }
  }, [user, loading, router, searchParams])

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/parent-invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not redeem this code')
        return
      }
      setLinkedName(data.child?.name || 'your child')
      setTimeout(() => router.push('/parent/dashboard'), 1400)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (linkedName) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 grid place-items-center h-14 w-14 rounded-2xl bg-green-100 text-green-600 ring-1 ring-green-200">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-7 w-7">
            <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-stone-900">Linked to {linkedName}!</h1>
        <p className="text-stone-500 mt-1">Taking you to your dashboard…</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 text-center">Link a child</h1>
      <p className="text-stone-500 mt-2 mb-6 text-center">
        Enter the invite code from your child or their tutor.
      </p>
      <form onSubmit={redeem} className="space-y-4">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7QMP2XR"
          autoCapitalize="characters"
          className="w-full px-4 py-3 rounded-xl bg-white text-center text-lg font-mono tracking-widest ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        {error && (
          <p className="text-sm text-red-600 bg-red-50 ring-1 ring-inset ring-red-200 rounded-xl px-3 py-2">{error}</p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={submitting} disabled={!code.trim()}>
          Link child
        </Button>
      </form>
      <p className="text-center mt-4 text-sm text-stone-400">
        Don&apos;t have a code?{' '}
        <Link href="/parent/children/new" className="text-orange-600 hover:text-orange-700 font-medium">Add your child directly</Link> instead.
      </p>
      <p className="text-center mt-2">
        <Link href="/parent/dashboard" className="text-sm text-stone-400 hover:text-stone-600">Back to dashboard</Link>
      </p>
    </div>
  )
}

export default function ParentJoinPage() {
  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <div className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-3xl ring-1 ring-stone-900/5 shadow-elevated p-6 sm:p-8">
          <Suspense fallback={<div className="h-64 animate-pulse bg-stone-100 rounded-2xl" />}>
            <JoinForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
