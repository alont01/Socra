'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/Button'
import { LoadingDots } from '@/components/ui/LoadingDots'
import { useToast } from '@/hooks/useToast'

type Role = 'STUDENT' | 'TUTOR' | 'PARENT'

interface ProfileData {
  email: string
  role: Role
  memberSince: string
  isAdmin: boolean
  isSuperAdmin: boolean
  profile: {
    name?: string
    gradeLevel?: string
    goals?: string
    mathTopics?: string[]
    bio?: string
    specialties?: string[]
  }
}

const ROLE_LABEL: Record<Role, string> = { STUDENT: 'Student', TUTOR: 'Tutor', PARENT: 'Parent' }

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-white text-stone-900 placeholder-stone-400 ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-shadow'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-stone-700 block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function memberSinceText(iso: string): string {
  const d = new Date(iso)
  const monthYear = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const months = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
  const dur = months < 1 ? 'less than a month' : months < 12
    ? `${months} month${months === 1 ? '' : 's'}`
    : `${Math.floor(months / 12)} year${Math.floor(months / 12) === 1 ? '' : 's'}`
  return `Member since ${monthYear} · ${dur}`
}

export default function SettingsPage() {
  const { user, loading, refresh } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [data, setData] = useState<ProfileData | null>(null)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)

  // Editable fields
  const [name, setName] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [goals, setGoals] = useState('')
  const [bio, setBio] = useState('')
  const [specialties, setSpecialties] = useState('')

  useEffect(() => {
    if (!loading && !user) router.push('/auth')
  }, [user, loading, router])

  const loadProfile = () => {
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ProfileData) => {
        setData(d)
        setName(d.profile.name || '')
        setGradeLevel(d.profile.gradeLevel || '')
        setGoals(d.profile.goals || '')
        setBio(d.profile.bio || '')
        setSpecialties((d.profile.specialties || []).join(', '))
      })
      .catch(() => setError(true))
  }

  useEffect(() => {
    if (!loading && user) loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  const save = async () => {
    if (!data) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { name }
      if (data.role === 'STUDENT') { payload.gradeLevel = gradeLevel; payload.goals = goals }
      if (data.role === 'TUTOR') { payload.bio = bio; payload.specialties = specialties }
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast(d.error || 'Could not save', 'error')
        return
      }
      toast('Profile saved', 'success')
      await refresh()
      loadProfile()
    } catch {
      toast('Could not save', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading || (!data && !error)) {
    return (
      <div className="min-h-screen bg-[#FFFBF5]">
        <Navbar />
        <div className="flex justify-center py-24"><LoadingDots /></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#FFFBF5]">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center text-stone-500">Couldn&apos;t load your settings.</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Settings</h1>

        {/* Account card */}
        <section className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6">
          <div className="flex items-center gap-4">
            <span className="grid place-items-center h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-white text-xl font-bold shadow-brand">
              {(name || data.email).charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-stone-900 truncate">{data.email}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 ring-1 ring-inset ring-orange-200/70">
                  {ROLE_LABEL[data.role]}
                </span>
                {data.isSuperAdmin ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-stone-900 text-white">Super Admin</span>
                ) : data.isAdmin ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-stone-800 text-white">Admin</span>
                ) : null}
              </div>
            </div>
          </div>
          <p className="text-xs text-stone-400 mt-4">{memberSinceText(data.memberSince)}</p>
          {data.isAdmin && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/admin" className="text-sm text-orange-600 hover:text-orange-700 font-medium">System Health →</Link>
              <Link href="/admin/logs" className="text-sm text-orange-600 hover:text-orange-700 font-medium">Logs →</Link>
              <Link href="/admin/tutors" className="text-sm text-orange-600 hover:text-orange-700 font-medium">Tutors →</Link>
            </div>
          )}
        </section>

        {/* Profile fields */}
        <section className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6">
          <h2 className="font-semibold text-stone-900 mb-4">Profile</h2>
          <div className="space-y-4">
            <Field label="Name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            {data.role === 'STUDENT' && (
              <>
                <Field label="Grade level">
                  <input className={inputCls} value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="e.g. Grade 9" />
                </Field>
                <Field label="Goals">
                  <textarea className={inputCls} rows={3} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="What do you want to improve?" />
                </Field>
                {data.profile.mathTopics && data.profile.mathTopics.length > 0 && (
                  <Field label="Topics">
                    <div className="flex flex-wrap gap-2">
                      {data.profile.mathTopics.map((t) => (
                        <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 ring-1 ring-inset ring-stone-200/70">{t}</span>
                      ))}
                    </div>
                  </Field>
                )}
              </>
            )}

            {data.role === 'TUTOR' && (
              <>
                <Field label="Expertise / specialties">
                  <input className={inputCls} value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="Algebra, Calculus, Geometry" />
                  <p className="text-xs text-stone-400 mt-1">Separate with commas.</p>
                </Field>
                <Field label="Bio">
                  <textarea className={inputCls} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell students about yourself" />
                </Field>
              </>
            )}
          </div>
          <div className="mt-5">
            <Button onClick={save} loading={saving}>Save changes</Button>
          </div>
        </section>

        {/* Account type (read-only) */}
        <section className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-6">
          <h2 className="font-semibold text-stone-900 mb-1">Account type</h2>
          <p className="text-sm text-stone-600">
            You&apos;re a <span className="font-medium text-stone-900">{ROLE_LABEL[data.role]}</span>. Account
            types are managed by Socra and can&apos;t be changed here.
          </p>
          {data.role === 'PARENT' && (
            <p className="text-sm text-stone-500 mt-2">Link children from your dashboard using a tutor&apos;s invite.</p>
          )}
        </section>
      </main>
    </div>
  )
}
