import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { isAdmin, isSuperAdmin } from '@/lib/admin'
import { safeJsonParse } from '@/lib/json'
import { recordAudit, auditContext } from '@/lib/audit'
import { route } from '@/lib/api-handler'
import { displayIdentity, isInternalStudentEmail } from '@/lib/student-handle'

// GET: current user's account + role-specific profile for the settings page.
export const GET = route('profile', async () => {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const user = await prisma.user.findUnique({
    where: { id: auth.payload.userId },
    include: { studentProfile: true, tutorProfile: true, parentProfile: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let profile: Record<string, unknown> = {}
  if (user.role === 'STUDENT' && user.studentProfile) {
    const s = user.studentProfile
    profile = {
      name: s.name,
      gradeLevel: s.gradeLevel,
      goals: s.goals,
      mathTopics: safeJsonParse<string[]>(s.mathTopics, []),
      onboardingDone: s.onboardingDone,
    }
  } else if (user.role === 'TUTOR' && user.tutorProfile) {
    const t = user.tutorProfile
    profile = {
      name: t.name,
      bio: t.bio,
      specialties: safeJsonParse<string[]>(t.specialties, []),
    }
  } else if (user.role === 'PARENT' && user.parentProfile) {
    profile = { name: user.parentProfile.name }
  }

  return NextResponse.json({
    id: user.id,
    // What Settings shows as this account's identity. A parent-created child
    // has a synthetic @students.socra.internal address they were never meant to
    // see — showing it told a kid their email was something no one can write
    // to. They sign in with a username, so that is what they get shown.
    identity: displayIdentity(user.email, user.username),
    email: isInternalStudentEmail(user.email) ? null : user.email,
    role: user.role,
    memberSince: user.createdAt,
    isAdmin: isAdmin(user.email),
    isSuperAdmin: isSuperAdmin(user.email),
    profile,
  })
})

// PATCH: update editable fields for the user's current role.
export const PATCH = route('profile', async (request: Request) => {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const role = auth.payload.role
  const userId = auth.payload.userId

  // Normalize a comma-separated string or array into a JSON string array.
  const toJsonList = (v: unknown): string | undefined => {
    if (Array.isArray(v)) return JSON.stringify(v.map(String).map((s) => s.trim()).filter(Boolean))
    if (typeof v === 'string') return JSON.stringify(v.split(',').map((s) => s.trim()).filter(Boolean))
    return undefined
  }
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() : undefined)

  if (role === 'STUDENT') {
    const data: Record<string, unknown> = {}
    if (str(body.name) !== undefined) data.name = str(body.name)
    if (str(body.gradeLevel) !== undefined) data.gradeLevel = str(body.gradeLevel)
    if (str(body.goals) !== undefined) data.goals = str(body.goals)
    const topics = toJsonList(body.mathTopics)
    if (topics !== undefined) data.mathTopics = topics
    if (data.name === '') return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    await prisma.studentProfile.update({ where: { userId }, data })
  } else if (role === 'TUTOR') {
    const data: Record<string, unknown> = {}
    if (str(body.name) !== undefined) data.name = str(body.name)
    if (str(body.bio) !== undefined) data.bio = str(body.bio)
    const specialties = toJsonList(body.specialties)
    if (specialties !== undefined) data.specialties = specialties
    if (data.name === '') return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    await prisma.tutorProfile.update({ where: { userId }, data })
  } else if (role === 'PARENT') {
    const name = str(body.name)
    if (name === '') return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (name !== undefined) await prisma.parentProfile.update({ where: { userId }, data: { name } })
  }

  recordAudit({
    action: 'profile.update',
    actor: { id: userId, email: auth.payload.email, role },
    ...auditContext(request),
  })

  return NextResponse.json({ success: true })
})
