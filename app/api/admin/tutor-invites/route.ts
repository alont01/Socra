import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { generateInviteCode } from '@/lib/invite-code'
import { recordAudit, auditContext } from '@/lib/audit'
import { route } from '@/lib/api-handler'

const INVITE_TTL_DAYS = 30

function publicOrigin(request: Request): string {
  const fwdHost = request.headers.get('x-forwarded-host')
  const fwdProto = request.headers.get('x-forwarded-proto') || 'https'
  const origin =
    process.env.AUTH_URL ||
    (fwdHost ? `${fwdProto}://${fwdHost}` : new URL(request.url).origin)
  return origin.replace(/\/$/, '')
}

// Admin-only: generate a tutor invite link. Redeeming it promotes the user to
// TUTOR — the only path to a tutor account.
export const POST = route('admin/tutor-invites', async (request: Request) => {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const note = typeof body.note === 'string' ? body.note.slice(0, 200) : ''
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  let invite = null
  for (let attempt = 0; attempt < 5 && !invite; attempt++) {
    try {
      invite = await prisma.tutorInvite.create({
        data: { code: generateInviteCode(), createdByUserId: auth.payload.userId, note, expiresAt },
      })
    } catch {
      // unique collision on code — retry
    }
  }
  if (!invite) return NextResponse.json({ error: 'Could not create invite' }, { status: 500 })

  recordAudit({
    action: 'tutor.invite.create',
    actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role },
    ...auditContext(request),
    metadata: { note },
  })

  return NextResponse.json({
    code: invite.code,
    url: `${publicOrigin(request)}/tutor/join?code=${invite.code}`,
    expiresAt: invite.expiresAt,
  })
})

export const GET = route('admin/tutor-invites', async () => {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const invites = await prisma.tutorInvite.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, code: true, note: true, status: true, expiresAt: true, redeemedAt: true, createdAt: true },
  })
  return NextResponse.json({ invites })
})
