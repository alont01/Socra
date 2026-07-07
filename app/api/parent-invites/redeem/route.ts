import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { recordAudit, auditContext } from '@/lib/audit'

/**
 * Redeem a parent invite code. The caller must be signed in as a parent; on
 * success the child (StudentProfile) is linked to their ParentProfile.
 */
export async function POST(request: Request) {
  try {
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

    // Atomically claim the invite so concurrent redemptions can't double-link.
    const claim = await prisma.parentInvite.updateMany({
      where: { id: invite.id, status: 'pending' },
      data: { status: 'redeemed', redeemedByParentId: parent.id, redeemedAt: new Date() },
    })
    if (claim.count === 0) {
      return NextResponse.json({ error: 'This invite has already been used' }, { status: 409 })
    }

    await prisma.studentProfile.update({
      where: { id: student.id },
      data: { parentId: parent.id },
    })

    recordAudit({
      action: 'parent.link',
      actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role },
      targetType: 'student',
      targetId: student.id,
      ...auditContext(request),
    })

    return NextResponse.json({ child: { id: student.id, name: student.name } })
  } catch (err) {
    console.error('[parent-invites redeem]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
