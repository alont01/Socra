import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken, type JWTPayload } from './auth'
import { prisma } from './prisma'
import type { TutorProfile, StudentProfile } from '@prisma/client'

// ── Discriminated union results ──

type AuthSuccess = { ok: true; payload: JWTPayload }
type TutorAuthSuccess = { ok: true; payload: JWTPayload; tutor: TutorProfile }
type StudentAuthSuccess = { ok: true; payload: JWTPayload; student: StudentProfile }
type AuthFailure = { ok: false; response: NextResponse }

/**
 * Verify JWT from cookie. Returns payload or a 401 response.
 */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
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
