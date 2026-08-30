'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatSlot } from '@/lib/availability'

interface Offer {
  id: string
  studentName: string
  gradeLevel: string
  goals: string
  desiredHoursPerWeek: number
  slots: { day: number; start: string; end: string }[]
  expiresAt: string
}

// Pending student-match offers, shown at the top of the tutor dashboard.
// First tutor to accept wins; this component is self-contained.
export function TutorOffers() {
  const [offers, setOffers] = useState<Offer[] | null>(null)
  const [busy, setBusy] = useState<string>('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  // A failed offers fetch used to collapse to the same empty-list render as
  // "nothing pending" — a pending match offer silently vanished from the
  // dashboard instead of showing a way to retry.
  const [loadFailed, setLoadFailed] = useState(false)

  const load = () => {
    setLoadFailed(false)
    fetch('/api/tutor/offers')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOffers(d.offers))
      .catch(() => setLoadFailed(true))
  }
  useEffect(load, [])

  const respond = async (id: string, action: 'accept' | 'decline') => {
    setBusy(id)
    setNote('')
    setError('')
    try {
      const res = await fetch(`/api/tutor/offers/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        load()
        return
      }
      if (action === 'accept') setNote(`You're now matched with ${data.student || 'this student'}. 🎉`)
      setOffers((prev) => (prev ? prev.filter((o) => o.id !== id) : prev))
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy('')
    }
  }

  if (loadFailed) {
    return (
      <p className="text-sm text-stone-500">
        Couldn&apos;t load your pending student matches.{' '}
        <button onClick={load} className="font-medium text-orange-600 hover:text-orange-700">Try again</button>
      </p>
    )
  }

  if (!offers || offers.length === 0) {
    if (note) return <p className="text-sm text-green-700">{note}</p>
    if (error) return <p className="text-sm text-red-600">{error}</p>
    return null
  }

  return (
    <section aria-labelledby="offers-heading" className="bg-white rounded-3xl ring-1 ring-orange-200/70 shadow-soft p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 id="offers-heading" className="font-semibold text-stone-900">
          New student {offers.length === 1 ? 'match' : 'matches'} <span className="ml-1 text-xs font-semibold text-orange-600 bg-orange-100 rounded-full px-2 py-0.5">{offers.length}</span>
        </h2>
        <Link href="/tutor/availability" className="text-xs text-orange-600 hover:text-orange-700">Edit availability →</Link>
      </div>
      {note && <p className="text-sm text-green-700 mb-3">{note}</p>}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="space-y-3">
        {offers.map((o) => (
          <div key={o.id} className="rounded-2xl ring-1 ring-stone-100 p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-stone-900">
                  {o.studentName}{o.gradeLevel ? <span className="text-stone-400 font-normal"> · Grade {o.gradeLevel}</span> : null}
                </p>
                <p className="text-xs text-stone-500 mt-0.5">{o.desiredHoursPerWeek} hr/week</p>
                {o.goals && <p className="text-sm text-stone-600 mt-1.5 line-clamp-2">{o.goals}</p>}
                {o.slots.length > 0 && (
                  <p className="text-xs text-stone-500 mt-2">
                    <span className="font-medium text-stone-600">You both free:</span>{' '}
                    {o.slots.slice(0, 4).map((s) => formatSlot(s)).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => respond(o.id, 'decline')} disabled={busy === o.id}
                  className="text-sm px-3 py-1.5 rounded-xl ring-1 ring-inset ring-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  onClick={() => respond(o.id, 'accept')} disabled={busy === o.id}
                  className="text-sm px-4 py-1.5 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-50"
                >
                  {busy === o.id ? '…' : 'Accept'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
