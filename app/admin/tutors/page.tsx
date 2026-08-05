'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/hooks/useToast'

interface Invite {
  id: string
  code: string
  note: string
  status: string
  expiresAt: string
  redeemedAt: string | null
  createdAt: string
}

export default function AdminTutorsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [invites, setInvites] = useState<Invite[] | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [lastLink, setLastLink] = useState('')

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
  }, [user, loading, router])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tutor-invites')
      if (res.status === 403) return setState('forbidden')
      if (!res.ok) return setState('error')
      const data = await res.json()
      setInvites(data.invites)
      setState('ok')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    setCreating(true)
    setLastLink('')
    try {
      const res = await fetch('/api/admin/tutor-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || 'Could not create invite', 'error')
        return
      }
      setLastLink(data.url)
      setNote('')
      load()
    } catch {
      toast('Could not create invite', 'error')
    } finally {
      setCreating(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied', 'success')
    } catch {
      toast('Copy failed', 'error')
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Tutors</h1>
          <Link href="/admin" className="text-sm text-orange-600 hover:text-orange-700 font-medium">← Admin</Link>
        </div>

        {state === 'forbidden' ? (
          <div className="rounded-3xl ring-1 ring-stone-900/5 bg-white shadow-soft p-8 text-center text-stone-600">
            You don&apos;t have access to the admin area.
          </div>
        ) : (
          <>
            {/* Create invite */}
            <section className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6 mb-6">
              <h2 className="font-semibold text-stone-900 mb-1">Invite a new tutor</h2>
              <p className="text-sm text-stone-600 mb-4">
                Generate a link. The recipient signs up (or logs in) and the link activates their tutor account.
                This is the only way to create a tutor.
              </p>
              <div className="flex flex-wrap gap-2">
                <label htmlFor="invite-note" className="sr-only">Note</label>
                <input
                  id="invite-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note (e.g. name or email)"
                  className="flex-1 min-w-[200px] px-3.5 py-2.5 rounded-xl bg-white text-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <Button onClick={create} loading={creating}>Generate link</Button>
              </div>

              {lastLink && (
                <div className="mt-4 rounded-2xl bg-orange-50 ring-1 ring-inset ring-orange-100 p-4">
                  <p className="text-xs text-stone-500 mb-2">Share this link with the new tutor:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-orange-800 break-all">{lastLink}</code>
                    <Button size="sm" onClick={() => copy(lastLink)}>Copy</Button>
                  </div>
                </div>
              )}
            </section>

            {/* Existing invites */}
            <section className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft overflow-hidden">
              <h2 className="font-semibold text-stone-900 px-6 pt-6 pb-3">Recent invites</h2>
              {state === 'loading' ? (
                <div className="px-6 pb-6 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 rounded-lg" />
                  ))}
                </div>
              ) : !invites || invites.length === 0 ? (
                <p className="px-6 pb-8 text-sm text-stone-400 text-center">No invites yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-900/5">
                      <th className="px-6 py-3 font-medium">Code</th>
                      <th className="px-6 py-3 font-medium">Note</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((inv) => (
                      <tr key={inv.id} className="border-b border-stone-900/5 last:border-0">
                        <td className="px-6 py-3 font-mono text-stone-800">{inv.code}</td>
                        <td className="px-6 py-3 text-stone-500">{inv.note || '—'}</td>
                        <td className="px-6 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${
                            inv.status === 'redeemed' ? 'bg-green-100 text-green-700 ring-green-200/70'
                            : inv.status === 'revoked' ? 'bg-stone-100 text-stone-500 ring-stone-200/70'
                            : 'bg-amber-100 text-amber-700 ring-amber-200/70'
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-stone-400 text-xs">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
