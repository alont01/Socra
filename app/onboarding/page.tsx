'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Link from 'next/link'

const GRADE_LEVELS = ['3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th']

export default function OnboardingPage() {
  const { user, loading, refresh } = useAuth()
  const router = useRouter()

  const [name, setName] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && !user) router.replace('/auth')
    if (!loading && user?.role === 'TUTOR') router.replace('/dashboard')
    if (!loading && user?.studentProfile?.name) setName(user.studentProfile.name)
  }, [user, loading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !gradeLevel) return

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), gradeLevel }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Something went wrong')
        return
      }
      await refresh()
      router.push('/dashboard')
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col">
      <div className="p-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <span className="text-2xl font-bold text-orange-500">∑</span>
          <span className="text-xl font-bold text-stone-900">Socra</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-stone-900">Tell us about yourself</h1>
            <p className="text-stone-500 mt-2">Quick setup so we can personalize your experience.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Your Name"
              placeholder="First name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <div>
              <label className="text-sm font-medium text-stone-700 block mb-2">Grade Level</label>
              <div className="grid grid-cols-4 gap-2">
                {GRADE_LEVELS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGradeLevel(g)}
                    className={`py-2 rounded-xl border text-sm font-medium transition-all ${
                      gradeLevel === g
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-stone-200 text-stone-600 hover:border-orange-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={saving}
              disabled={!name.trim() || !gradeLevel}
            >
              Get Started
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
