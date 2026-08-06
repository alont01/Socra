'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

const perks = [
  'Free first session — no commitment',
  'Private 1-on-1 tutoring in Boston & Metro area',
  'A learning tool that keeps your child moving between sessions',
]

// bookingUrl is the Cal.com/Calendly inline-embed URL, read at runtime by the
// server component and passed in. Empty string => graceful "we'll reach out"
// fallback (lead is still captured).
export default function GetStartedClient({ bookingUrl }: { bookingUrl: string }) {
  const BOOKING_URL = bookingUrl
  const [form, setForm] = useState({ name: '', email: '', phone: '', studentGrade: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.email.trim()) {
      setError('Please enter your email so we can reach you.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'website' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }
      setSubmitted(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 py-10 md:py-16">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur ring-1 ring-orange-200/70 text-orange-700 px-4 py-1.5 rounded-full text-sm font-medium mb-6 shadow-soft">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
            </span>
            Free first session
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-stone-900 leading-[1.05] mb-4">
            Book your child&rsquo;s <span className="text-gradient-brand">free consultation</span>
          </h1>
          <p className="text-lg text-stone-500 leading-relaxed">
            Tell us a little about your child and pick a time that works. We&rsquo;ll show you exactly how
            Socra makes math click — no commitment.
          </p>
        </div>

        {!submitted ? (
          <div className="grid lg:grid-cols-5 gap-6 items-start">
            {/* Lead form */}
            <form
              onSubmit={submit}
              className="lg:col-span-3 bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 md:p-8"
              noValidate
            >
              <h2 className="text-lg font-semibold text-stone-900 mb-1">Tell us about your child</h2>
              <p className="text-sm text-stone-500 mb-6">Only your email is required — the rest helps us prepare.</p>

              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Your name" placeholder="Jane Parent" value={form.name} onChange={set('name')} autoComplete="name" />
                <Input label="Email" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} autoComplete="email" required />
                <Input label="Phone (optional)" type="tel" placeholder="(555) 123-4567" value={form.phone} onChange={set('phone')} autoComplete="tel" />
                <Input label="Student grade (optional)" placeholder="e.g. 9th grade" value={form.studentGrade} onChange={set('studentGrade')} />
              </div>

              <div className="flex flex-col gap-1 mt-4">
                <label htmlFor="message" className="text-sm font-medium text-stone-700">What would you like help with? (optional)</label>
                <textarea
                  id="message"
                  rows={3}
                  placeholder="Algebra, upcoming test, building confidence…"
                  value={form.message}
                  onChange={set('message')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white text-stone-900 placeholder-stone-400 ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-shadow duration-200 resize-y"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 mt-4" role="alert">{error}</p>
              )}

              <Button type="submit" size="lg" loading={submitting} className="w-full mt-6">
                Continue to scheduling
              </Button>
              <p className="text-xs text-stone-400 text-center mt-3">
                By continuing you agree to be contacted about tutoring. We never share your info.
              </p>
            </form>

            {/* Reassurance rail */}
            <aside className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6">
                <h3 className="font-semibold text-stone-900 mb-4">What you get</h3>
                <ul className="space-y-3">
                  {perks.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm text-stone-600">
                      <span className="mt-0.5 grid place-items-center h-5 w-5 rounded-full bg-orange-100 text-orange-600 flex-none">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3 w-3"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-brand p-6">
                <p className="text-sm text-orange-50/90 leading-relaxed">
                  &ldquo;Struggling with math? We&rsquo;ll make it click.&rdquo;
                </p>
                <p className="text-xs text-orange-100/80 mt-3">
                  Questions? Call (518) 645-2165 or email hello@socratutoring.com
                </p>
              </div>
            </aside>
          </div>
        ) : (
          /* Step 2: confirmation + scheduler */
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 md:p-8 text-center mb-6">
              <div className="mx-auto mb-4 grid place-items-center h-14 w-14 rounded-2xl bg-green-100 text-green-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-7 w-7"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-stone-900 mb-2">You&rsquo;re all set{form.name ? `, ${form.name.split(' ')[0]}` : ''}!</h2>
              <p className="text-stone-500">
                We&rsquo;ve got your request and sent a confirmation to <span className="font-medium text-stone-700">{form.email}</span>.
                {BOOKING_URL ? ' Pick a time below to lock in your free session.' : ' A member of our team will reach out shortly to schedule.'}
              </p>
            </div>

            {BOOKING_URL ? (
              <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft overflow-hidden">
                <iframe
                  src={BOOKING_URL}
                  title="Schedule your free consultation"
                  className="w-full"
                  style={{ height: 720, border: 'none' }}
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="text-center">
                <Link href="/" className="text-orange-600 hover:text-orange-700 font-medium text-sm">← Back to home</Link>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
