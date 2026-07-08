import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { generateInviteCode } from '@/lib/invite-code'
import { recordAudit, auditContext } from '@/lib/audit'

const INVITE_TTL_DAYS = 14

/**
 * Determine whether `userId` may manage parent invites for `studentId`.
 * Only a tutor who has the student on their roster may do so.
 * Returns 'TUTOR' or null.
 */
async function creatorRoleFor(userId: string, studentId: string): Promise<'TUTOR' | null> {
  const tutor = await prisma.tutorProfile.findUnique({ where: { userId }, select: { id: true } })
  if (!tutor) return null
  const link = await prisma.tutorStudent.findUnique({
    where: { tutorId_studentId: { tutorId: tutor.id, studentId } },
    select: { id: true },
  })
  return link ? 'TUTOR' : null
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const studentId = typeof body.studentId === 'string' ? body.studentId : ''
    if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 })

    const role = await creatorRoleFor(auth.payload.userId, studentId)
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

    // Retry a few times in the (astronomically unlikely) event of a code clash.
    let invite = null
    for (let attempt = 0; attempt < 5 && !invite; attempt++) {
      try {
        invite = await prisma.parentInvite.create({
          data: {
            code: generateInviteCode(),
            studentId,
            createdByUserId: auth.payload.userId,
            createdByRole: role,
            expiresAt,
          },
        })
      } catch {
        // unique collision on code — try again
      }
    }
    if (!invite) return NextResponse.json({ error: 'Could not create invite' }, { status: 500 })

    recordAudit({
      action: 'parent.invite.create',
      actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role },
      targetType: 'student',
      targetId: studentId,
      ...auditContext(request),
    })

    // Prefer the public URL (Render sits behind a proxy, so request.url can be
    // an internal origin). Fall back to the forwarded host, then request origin.
    const fwdHost = request.headers.get('x-forwarded-host')
    const fwdProto = request.headers.get('x-forwarded-proto') || 'https'
    const origin =
      process.env.AUTH_URL ||
      (fwdHost ? `${fwdProto}://${fwdHost}` : new URL(request.url).origin)
    return NextResponse.json({
      code: invite.code,
      url: `${origin.replace(/\/$/, '')}/parent/join?code=${invite.code}`,
      expiresAt: invite.expiresAt,
    })
  } catch (err) {
    console.error('[parent-invites POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

    const studentId = new URL(request.url).searchParams.get('studentId') || ''
    if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 })

    const role = await creatorRoleFor(auth.payload.userId, studentId)
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const invites = await prisma.parentInvite.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, code: true, status: true, expiresAt: true, redeemedAt: true, createdAt: true },
    })

    return NextResponse.json({ invites })
  } catch (err) {
    console.error('[parent-invites GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
