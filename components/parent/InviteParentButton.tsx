'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'

interface InviteParentButtonProps {
  studentId: string
  /** Optional label override, e.g. for the tutor roster. */
  label?: string
}

interface Invite { code: string; url: string; expiresAt: string }

/**
 * Generates a parent invite for `studentId` and shows the shareable code + link.
 * Used by students (self) and tutors (roster). The API authorizes both.
 */
export function InviteParentButton({ studentId, label = 'Invite a parent' }: InviteParentButtonProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [invite, setInvite] = useState<Invite | null>(null)

  const generate = async () => {
    setOpen(true)
    if (invite) return
    setLoading(true)
    try {
      const res = await fetch('/api/parent-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || 'Could not create invite', 'error')
        setOpen(false)
        return
      }
      setInvite(data)
    } catch {
      toast('Could not create invite', 'error')
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied to clipboard', 'success')
    } catch {
      toast('Copy failed', 'error')
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={generate}>{label}</Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-elevated p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-stone-900 mb-1">Invite a parent</h3>
            <p className="text-sm text-stone-500 mb-5">
              Share this code (or link) with a parent. They&apos;ll sign up and enter it to follow this student&apos;s progress.
            </p>

            {loading ? (
              <div className="h-24 animate-pulse bg-stone-100 rounded-2xl" />
            ) : invite ? (
              <>
                <button
                  onClick={() => copy(invite.code)}
                  className="w-full mb-3 rounded-2xl bg-orange-50 ring-1 ring-inset ring-orange-100 py-4 text-center text-2xl font-mono font-bold tracking-widest text-orange-700 hover:bg-orange-100 transition-colors"
                >
                  {invite.code}
                </button>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => copy(invite.url)}>Copy link</Button>
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => setOpen(false)}>Done</Button>
                </div>
                <p className="text-xs text-stone-400 mt-3 text-center">
                  Expires {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}
