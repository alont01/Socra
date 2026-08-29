import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { suggestPassword } from '@/lib/child-credentials'
import { resetChildPasswordSchema, parseBody } from '@/lib/validations'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit, auditContext } from '@/lib/audit'
import { route } from '@/lib/api-handler'

/**
 * POST — the parent sets a new sign-in password for their child.
 *
 * This is the only account-recovery path a child account has. They're created
 * with a synthetic `@students.socra.internal` email that nothing can deliver
 * to, so /auth/forgot-password can't help them, and the password is shown to
 * the parent exactly once at creation. Without this endpoint the first
 * forgotten password locked the child out permanently.
 *
 * The new password is returned in the response so the parent can read it out
 * to their child — same one-time handoff as account creation.
 */
export const POST = route(
  'parent/children/[id]/password',
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireParent()
    if (!auth.ok) return auth.response
    const { id } = await params

    const rl = rateLimit(`child-password:${auth.payload.userId}`, { maxRequests: 10, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const body = await request.json().catch(() => ({}))
    const parsed = parseBody(resetChildPasswordSchema, body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    // Ownership: the child must be linked to this parent. Scoping the lookup by
    // parentId (rather than checking after) means an id belonging to someone
    // else's child is indistinguishable from one that doesn't exist.
    const child = await prisma.studentProfile.findFirst({
      where: { id, parentId: auth.parent.id },
      select: { id: true, name: true, userId: true, user: { select: { username: true } } },
    })
    if (!child) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const password = parsed.data.password ?? suggestPassword()
    const passwordHash = await hashPassword(password)

    await prisma.user.update({
      where: { id: child.userId },
      data: { passwordHash },
    })

    // Any outstanding reset tokens for this account are now stale.
    await prisma.passwordResetToken.deleteMany({ where: { userId: child.userId } })

    recordAudit({
      action: 'parent.child.password_reset',
      actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role },
      targetType: 'student',
      targetId: child.id,
      ...auditContext(request),
    })

    return NextResponse.json({
      credentials: { username: child.user.username, password },
    })
  },
  { errorMessage: 'Could not reset the password. Please try again.' },
)
