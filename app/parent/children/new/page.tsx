'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { AvailabilityPicker } from '@/components/AvailabilityPicker'
import type { AvailabilityBlock } from '@/lib/availability'

const WORDS = ['tiger', 'comet', 'maple', 'river', 'pixel', 'mango', 'orbit', 'delta']
function suggestPassword() {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)]
  return `${w}${Math.floor(1000 + Math.random() * 9000)}`
}
function slugFromName(name: string) {
  const base = name.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z0-9]/g, '') || ''
  return base ? `${base}${Math.floor(10 + Math.random() * 90)}` : ''
}

export default function AddChildPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({ name: '', gradeLevel: '', goals: '', username: '', password: '' })
  const [desiredHours, setDesiredHours] = useState('1')
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([])
  const [showPw, setShowPw] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<null | { username: string; password: string; name: string; matchStatus?: string }>(null)
  const [copied, setCopied] = useState('')

  // Redirect non-parents.
  if (!loading && user && user.role !== 'PARENT') router.replace('/dashboard')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // Auto-suggest a username/password from the name once, if still blank.
  const onNameBlur = () => {
    setForm((f) => ({
      ...f,
      username: f.username || slugFromName(f.name),
      password: f.password || suggestPassword(),
    }))
  }

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError("Please enter your child's name.")
    if (!form.username.trim()) return setError('Please choose a username for your child.')
    if (form.password.length < 6) return setError('Password must be at least 6 characters.')
    setSubmitting(true)
    try {
      const res = await fetch('/api/parent/children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, desiredHoursPerWeek: Number(desiredHours) || 1, availability }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }
      setDone({ username: data.credentials.username, password: data.credentials.password, name: form.name.trim(), matchStatus: data.matchStatus })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-xl mx-auto px-4 py-10">
        <Link href="/parent/dashboard" className="text-sm text-orange-600 hover:text-orange-700">← Back to dashboard</Link>

        {!done ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-stone-900 mt-4 mb-2">Add your child</h1>
            <p className="text-stone-500 mb-8">
              Create a login your child will use for sessions, practice, and progress. You can manage everything from your dashboard.
            </p>

            <form onSubmit={submit} className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 md:p-8" noValidate>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Child's name" placeholder="Maya" value={form.name} onChange={set('name')} onBlur={onNameBlur} required />
                <Input label="Grade (optional)" placeholder="e.g. 9th grade" value={form.gradeLevel} onChange={set('gradeLevel')} />
              </div>

              <div className="flex flex-col gap-1 mt-4">
                <label htmlFor="goals" className="text-sm font-medium text-stone-700">Goals (optional)</label>
                <textarea
                  id="goals" rows={2} placeholder="Build confidence with algebra, prep for the SAT…"
                  value={form.goals} onChange={set('goals')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white text-stone-900 placeholder-stone-400 ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-shadow duration-200 resize-y"
                />
              </div>

              <div className="mt-6 pt-6 border-t border-stone-100">
                <p className="text-sm font-semibold text-stone-800 mb-1">When can they meet a tutor?</p>
                <p className="text-xs text-stone-500 mb-4">We&rsquo;ll use this to match your child with an available tutor. You can change it later.</p>
                <div className="mb-4">
                  <label htmlFor="hours" className="block text-sm font-medium text-stone-700 mb-1">Hours per week</label>
                  <input
                    id="hours" type="number" min={1} max={20} value={desiredHours}
                    onChange={(e) => setDesiredHours(e.target.value)}
                    className="w-24 rounded-xl ring-1 ring-inset ring-stone-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <AvailabilityPicker value={availability} onChange={setAvailability} />
              </div>

              <div className="mt-6 pt-6 border-t border-stone-100">
                <p className="text-sm font-semibold text-stone-800 mb-1">Your child&rsquo;s login</p>
                <p className="text-xs text-stone-500 mb-4">They&rsquo;ll use these to sign in — no email needed. You can share them after.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input label="Username" placeholder="maya42" value={form.username} onChange={set('username')} autoCapitalize="none" autoCorrect="off" required />
                  <div className="flex flex-col gap-1">
                    <label htmlFor="pw" className="text-sm font-medium text-stone-700">Password</label>
                    <div className="flex gap-2">
                      <input
                        id="pw" type={showPw ? 'text' : 'password'} placeholder="At least 6 characters"
                        value={form.password} onChange={set('password')}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white text-stone-900 placeholder-stone-400 ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-shadow duration-200"
                      />
                      <button type="button" onClick={() => setShowPw((s) => !s)} className="text-xs text-stone-500 hover:text-stone-700 px-2 shrink-0" aria-label={showPw ? 'Hide password' : 'Show password'}>
                        {showPw ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, password: suggestPassword() }))} className="text-xs text-orange-600 hover:text-orange-700 self-start mt-1">
                      Generate a password
                    </button>
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 mt-4" role="alert">{error}</p>}

              <Button type="submit" size="lg" loading={submitting} className="w-full mt-6">Create child account</Button>
            </form>
          </>
        ) : (
          /* Success — credentials handoff */
          <div className="mt-4">
            <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 md:p-8 text-center">
              <div className="mx-auto mb-4 grid place-items-center h-14 w-14 rounded-2xl bg-green-100 text-green-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-7 w-7"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h1 className="text-2xl font-bold text-stone-900 mb-1">{done.name}&rsquo;s account is ready</h1>
              <p className="text-stone-500 mb-6">Share these with {done.name}. They sign in at <span className="font-medium text-stone-700">socratutoring.com</span>.</p>

              <div className="text-left rounded-2xl bg-orange-50 ring-1 ring-orange-100 p-4 space-y-3">
                {([['Username', done.username], ['Password', done.password]] as const).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-stone-500">{label}</p>
                      <p className="font-mono text-stone-900">{value}</p>
                    </div>
                    <button onClick={() => copy(label, value)} className="text-xs font-medium text-orange-600 hover:text-orange-700 px-2 py-1">
                      {copied === label ? 'Copied ✓' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-stone-400 mt-4">Tip: write these down — for security we won&rsquo;t show the password again.</p>

              {done.matchStatus && (
                <div className="mt-5 rounded-2xl bg-stone-50 ring-1 ring-stone-100 p-4 text-sm text-stone-600">
                  {done.matchStatus === 'offered'
                    ? '🔎 We’re reaching out to available tutors now — you’ll get an email as soon as one is matched.'
                    : done.matchStatus === 'already_matched'
                    ? '✅ Your child already has a tutor.'
                    : 'We couldn’t find an available tutor for those times just yet — our team will follow up to get them matched.'}
                </div>
              )}

              <div className="flex gap-3 justify-center mt-6">
                <Button variant="ghost" onClick={() => { setDone(null); setForm({ name: '', gradeLevel: '', goals: '', username: '', password: '' }) }}>Add another child</Button>
                <Link href="/parent/dashboard"><Button>Go to dashboard</Button></Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
