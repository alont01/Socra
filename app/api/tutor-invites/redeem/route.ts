import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'
import { recordAudit, auditContext } from '@/lib/audit'
import { route } from '@/lib/api-handler'
import { setAuthCookie } from '@/lib/auth-cookie'

/**
 * Redeem an admin-issued tutor invite. Promotes the current (logged-in) user to
 * TUTOR: creates a TutorProfile if missing, flips their role, and re-issues the
 * JWT cookie. This is the only way to obtain a tutor account.
 */
export const POST = route('tutor-invites/redeem', async (request: Request) => {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const invite = await prisma.tutorInvite.findUnique({ where: { code } })
  if (!invite) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'This invite has already been used' }, { status: 409 })
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.payload.userId },
    include: { studentProfile: true, tutorProfile: true, parentProfile: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const previousRole = user.role
  const name =
    user.tutorProfile?.name ||
    user.studentProfile?.name ||
    user.parentProfile?.name ||
    user.email.split('@')[0]

  // Atomically claim the invite so it can't be redeemed twice.
  const claim = await prisma.tutorInvite.updateMany({
    where: { id: invite.id, status: 'pending' },
    data: { status: 'redeemed', redeemedByUserId: user.id, redeemedAt: new Date() },
  })
  if (claim.count === 0) {
    return NextResponse.json({ error: 'This invite has already been used' }, { status: 409 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: 'TUTOR' } })
    if (!user.tutorProfile) {
      await tx.tutorProfile.create({ data: { userId: user.id, name } })
    }
  })

  const token = await signToken({ userId: user.id, email: user.email, role: 'TUTOR' })

  recordAudit({
    action: 'tutor.invite.redeem',
    actor: { id: user.id, email: user.email, role: 'TUTOR' },
    ...auditContext(request),
    metadata: { from: previousRole, inviteId: invite.id },
  })

  const response = NextResponse.json({ success: true, role: 'TUTOR' })
  setAuthCookie(response, token)
  return response
})
