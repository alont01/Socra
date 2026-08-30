import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { recordAudit, auditContext } from '@/lib/audit'
import { route } from '@/lib/api-handler'

/**
 * Redeem a parent invite code. The caller must be signed in as a parent; on
 * success the child (StudentProfile) is linked to their ParentProfile.
 */
export const POST = route('parent-invites/redeem', async (request: Request) => {
  const auth = await requireParent()
  if (!auth.ok) return auth.response
  const parent = auth.parent

  const body = await request.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const invite = await prisma.parentInvite.findUnique({ where: { code } })
  if (!invite) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'This invite has already been used' }, { status: 409 })
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })
  }

  const student = await prisma.studentProfile.findUnique({
    where: { id: invite.studentId },
    select: { id: true, name: true, parentId: true },
  })
  if (!student) return NextResponse.json({ error: 'Student no longer exists' }, { status: 404 })
  if (student.parentId && student.parentId !== parent.id) {
    return NextResponse.json({ error: 'This student is already linked to a parent' }, { status: 409 })
  }

  // Claiming the invite and linking the student must succeed or fail together.
  // Two different pending invites for the SAME student (e.g. issued by two
  // different tutors, or reissued) can be redeemed by two different parents at
  // once — each claims its own invite row (they don't collide with each other)
  // and then both proceeded to unconditionally overwrite `parentId`, so the
  // second write silently reparented the child regardless of the check above,
  // which only reads a stale snapshot. Scoping the student update to
  // `parentId: null` inside the same transaction as the invite claim makes the
  // whole thing atomic: whichever request's transaction commits first wins
  // both writes, and the loser's student update matches zero rows, throws, and
  // rolls its invite claim back to `pending` rather than leaving a redeemed
  // invite that never actually linked anyone.
  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.parentInvite.updateMany({
        where: { id: invite.id, status: 'pending' },
        data: { status: 'redeemed', redeemedByParentId: parent.id, redeemedAt: new Date() },
      })
      if (claim.count === 0) throw new Error('INVITE_TAKEN')

      const linked = await tx.studentProfile.updateMany({
        where: { id: student.id, OR: [{ parentId: null }, { parentId: parent.id }] },
        data: { parentId: parent.id },
      })
      if (linked.count === 0) throw new Error('STUDENT_ALREADY_LINKED')
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'INVITE_TAKEN') {
      return NextResponse.json({ error: 'This invite has already been used' }, { status: 409 })
    }
    if (err instanceof Error && err.message === 'STUDENT_ALREADY_LINKED') {
      return NextResponse.json({ error: 'This student is already linked to a parent' }, { status: 409 })
    }
    throw err
  }

  recordAudit({
    action: 'parent.link',
    actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role },
    targetType: 'student',
    targetId: student.id,
    ...auditContext(request),
  })

  return NextResponse.json({ child: { id: student.id, name: student.name } })
})
