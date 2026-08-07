'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/Button'
import { AvailabilityPicker } from '@/components/AvailabilityPicker'
import type { AvailabilityBlock } from '@/lib/availability'

export default function TutorAvailabilityPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [maxHours, setMaxHours] = useState<string>('')
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([])
  const [accepting, setAccepting] = useState(true)
  const [load, setLoad] = useState<{ activeStudents: number; remainingHours: number } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
    else if (!loading && user && user.role !== 'TUTOR') router.replace('/dashboard')
  }, [user, loading, router])

  useEffect(() => {
    if (loading || user?.role !== 'TUTOR') return
    fetch('/api/tutor/matching-setup')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setMaxHours(d.maxHoursPerWeek == null ? '' : String(d.maxHoursPerWeek))
        setAvailability(d.availability || [])
        setAccepting(d.acceptingStudents)
        setLoad({ activeStudents: d.activeStudents, remainingHours: d.remainingHours })
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [loading, user])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/tutor/matching-setup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxHoursPerWeek: maxHours === '' ? null : Number(maxHours),
          availability,
          acceptingStudents: accepting,
        }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <Link href="/dashboard" className="text-sm text-orange-600 hover:text-orange-700">← Back to dashboard</Link>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 mt-4 mb-2">Your availability</h1>
        <p className="text-stone-500 mb-8">Set how many hours you can take and when you&rsquo;re free. We use this to match you with new students.</p>

        {state === 'loading' ? (
          <p className="text-stone-400">Loading…</p>
        ) : state === 'error' ? (
          <p className="text-red-600">Couldn&rsquo;t load your setup. Please refresh.</p>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6">
              <label htmlFor="maxHours" className="block text-sm font-medium text-stone-700 mb-1">Max hours per week</label>
              <input
                id="maxHours" type="number" min={0} max={80} value={maxHours}
                onChange={(e) => setMaxHours(e.target.value)} placeholder="e.g. 10"
                className="w-32 rounded-xl ring-1 ring-inset ring-stone-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              {load && (
                <p className="text-xs text-stone-500 mt-2">
                  Currently {load.activeStudents} student{load.activeStudents === 1 ? '' : 's'} · {load.remainingHours} hr/week free
                </p>
              )}
            </div>

            <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6">
              <p className="text-sm font-medium text-stone-700 mb-3">Weekly availability</p>
              <AvailabilityPicker value={availability} onChange={setAvailability} />
            </div>

            <label className="flex items-center gap-3 bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5 cursor-pointer">
              <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} className="h-4 w-4 accent-orange-500" />
              <span className="text-sm text-stone-700">Accepting new students (receive match offers)</span>
            </label>

            <div className="flex items-center gap-3">
              <Button onClick={save} loading={saving} size="lg">Save availability</Button>
              {saved && <span className="text-sm text-green-600">Saved ✓</span>}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
