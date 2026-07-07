import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken, type JWTPayload } from './auth'
import { prisma } from './prisma'
import type { TutorProfile, StudentProfile, ParentProfile } from '@prisma/client'

// ── Discriminated union results ──

type AuthSuccess = { ok: true; payload: JWTPayload }
type TutorAuthSuccess = { ok: true; payload: JWTPayload; tutor: TutorProfile }
type StudentAuthSuccess = { ok: true; payload: JWTPayload; student: StudentProfile }
type ParentAuthSuccess = { ok: true; payload: JWTPayload; parent: ParentProfile }
type AuthFailure = { ok: false; response: NextResponse }

/**
 * Verify JWT from either the `token` cookie (web) or an
 * `Authorization: Bearer <jwt>` header (native/mobile clients).
 * Returns payload or a 401 response.
 */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const cookieStore = await cookies()
  let token = cookieStore.get('token')?.value
  if (!token) {
    const authHeader = (await headers()).get('authorization')
    if (authHeader?.startsWith('Bearer ')) token = authHeader.slice(7).trim()
  }
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { ok: true, payload }
}

/**
 * Verify JWT + require TutorProfile exists for this user.
 */
export async function requireTutor(): Promise<TutorAuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const tutor = await prisma.tutorProfile.findUnique({
    where: { userId: auth.payload.userId },
  })
  if (!tutor) {
    return { ok: false, response: NextResponse.json({ error: 'Not a tutor' }, { status: 403 }) }
  }

  return { ok: true, payload: auth.payload, tutor }
}

/**
 * Verify JWT + require the user's email is in the ADMIN_EMAILS allowlist
 * (comma-separated env var). Used to gate the operator/admin dashboard.
 * Secure by default: if ADMIN_EMAILS is unset/empty, no one is an admin.
 */
export async function requireAdmin(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const allowlist = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  const email = auth.payload.email?.toLowerCase()
  if (!email || !allowlist.includes(email)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, payload: auth.payload }
}

/**
 * Verify JWT + require StudentProfile exists for this user.
 */
export async function requireStudent(): Promise<StudentAuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const student = await prisma.studentProfile.findUnique({
    where: { userId: auth.payload.userId },
  })
  if (!student) {
    return { ok: false, response: NextResponse.json({ error: 'Not a student' }, { status: 403 }) }
  }

  return { ok: true, payload: auth.payload, student }
}

/**
 * Verify JWT + require ParentProfile exists for this user.
 */
export async function requireParent(): Promise<ParentAuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const parent = await prisma.parentProfile.findUnique({
    where: { userId: auth.payload.userId },
  })
  if (!parent) {
    return { ok: false, response: NextResponse.json({ error: 'Not a parent' }, { status: 403 }) }
  }

  return { ok: true, payload: auth.payload, parent }
}
