import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'
import { isSuperAdmin } from '@/lib/admin'
import { recordAudit, auditContext } from '@/lib/audit'
import { route } from '@/lib/api-handler'
import { setAuthCookie } from '@/lib/auth-cookie'

const ROLES = ['STUDENT', 'TUTOR', 'PARENT'] as const
type Role = (typeof ROLES)[number]

/**
 * Switch the current user's own role. Restricted to super admins — regular
 * users cannot change their role. Lossless: existing profiles are kept so a
 * later switch back preserves data; creates the target profile if missing and
 * re-issues the JWT cookie (role is encoded in the token).
 */
export const POST = route('profile/role', async (request: Request) => {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  if (!isSuperAdmin(auth.payload.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const role = body.role as Role
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.payload.userId },
    include: { studentProfile: true, tutorProfile: true, parentProfile: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (user.role === role) {
    return NextResponse.json({ success: true, role, unchanged: true })
  }

  const name =
    user.studentProfile?.name ||
    user.tutorProfile?.name ||
    user.parentProfile?.name ||
    user.email.split('@')[0]

  const previousRole = user.role

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role } })
    if (role === 'STUDENT' && !user.studentProfile) {
      await tx.studentProfile.create({ data: { userId: user.id, name } })
    } else if (role === 'TUTOR' && !user.tutorProfile) {
      await tx.tutorProfile.create({ data: { userId: user.id, name } })
    } else if (role === 'PARENT' && !user.parentProfile) {
      await tx.parentProfile.create({ data: { userId: user.id, name } })
    }
  })

  const token = await signToken({ userId: user.id, email: user.email, role })

  recordAudit({
    action: 'profile.role_change',
    actor: { id: user.id, email: user.email, role },
    ...auditContext(request),
    metadata: { from: previousRole, to: role, superAdmin: true },
  })

  const response = NextResponse.json({ success: true, role })
  setAuthCookie(response, token)
  return response
})
