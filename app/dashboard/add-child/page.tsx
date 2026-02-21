'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'

const GRADES = [
  'Middle School (6-8)',
  'High School (9-10)',
  'High School (11-12)',
  'College',
  'Other',
]

export default function AddChildPage() {
  const router = useRouter()
  const { refresh } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/parent/add-child', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, gradeLevel }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        return
      }

      await refresh()
      router.push('/dashboard')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col">
      <div className="p-4 border-b border-orange-100 bg-white">
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <Link href="/dashboard" className="text-stone-500 hover:text-stone-900 text-sm">
            ← Back to Dashboard
          </Link>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">👧</div>
            <h1 className="text-2xl font-bold text-stone-900">Add a Child</h1>
            <p className="text-stone-500 mt-2">
              Create a Socra account for your child. They can log in with these credentials.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Child's Name"
                placeholder="e.g. Emma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Grade Level <span className="text-stone-400">(optional)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGradeLevel(gradeLevel === g ? '' : g)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        gradeLevel === g
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'border-stone-200 text-stone-600 hover:border-orange-300'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <Input
                label="Login Email"
                type="email"
                placeholder="child@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                label="Password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" size="lg" loading={loading}>
                Create Child Account →
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
