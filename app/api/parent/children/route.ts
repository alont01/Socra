import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireParent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { addChildSchema, parseBody } from '@/lib/validations'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit, auditContext } from '@/lib/audit'
import { runMatching } from '@/lib/matching'
import { notifyTutorsOfOffers } from '@/lib/match-notify'

// List the parent's linked children with a light progress summary.
export async function GET() {
  try {
    const auth = await requireParent()
    if (!auth.ok) return auth.response

    const children = await prisma.studentProfile.findMany({
      where: { parentId: auth.parent.id },
      select: { id: true, name: true, gradeLevel: true, goals: true },
      orderBy: { name: 'asc' },
    })

    const summaries = await Promise.all(
      children.map(async (c) => {
        const [mastery, lastSession] = await Promise.all([
          prisma.studentProgress.aggregate({
            where: { studentId: c.id },
            _avg: { mastery: true },
            _count: { _all: true },
          }),
          prisma.tutoringSession.findFirst({
            where: { studentId: c.id, status: 'completed' },
            orderBy: { endedAt: 'desc' },
            select: { topic: true, endedAt: true },
          }),
        ])
        return {
          ...c,
          avgMastery: mastery._avg.mastery,
          topicsTracked: mastery._count._all,
          lastSession: lastSession ? { topic: lastSession.topic, endedAt: lastSession.endedAt } : null,
        }
      }),
    )

    return NextResponse.json({ children: summaries })
  } catch (err) {
    console.error('[parent children]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Parent creates a child's student account. The parent sets a username +
// password the child logs in with — no student email needed. The child is
// linked to this parent; if availability is provided, tutor matching kicks off.
export async function POST(request: Request) {
  try {
    const auth = await requireParent()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`add-child:${auth.payload.userId}`, { maxRequests: 10, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    const parsed = parseBody(addChildSchema, body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const username = parsed.data.username.toLowerCase().trim()
    const name = parsed.data.name.trim()
    const gradeLevel = (parsed.data.gradeLevel || '').trim()
    const goals = (parsed.data.goals || '').trim()
    const password = parsed.data.password
    const desiredHoursPerWeek = parsed.data.desiredHoursPerWeek ?? 1
    const availability = JSON.stringify(parsed.data.availability ?? [])
    const hasAvailability = (parsed.data.availability ?? []).length > 0

    // Friendly pre-check (a race is still caught by the unique constraint below).
    const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } })
    if (taken) {
      return NextResponse.json({ error: 'That username is taken — please choose another.' }, { status: 409 })
    }

    // Parent-created students have no real email; store a synthetic, non-
    // deliverable internal address so email-keyed code keeps working. The child
    // never sees or needs it — they log in with their username.
    const syntheticEmail = `student.${randomBytes(9).toString('hex')}@students.socra.internal`
    const passwordHash = await hashPassword(password)

    let child
    try {
      const user = await prisma.user.create({
        data: {
          email: syntheticEmail,
          username,
          passwordHash,
          role: 'STUDENT',
          emailVerified: true, // no email to verify
          studentProfile: {
            create: {
              name, gradeLevel, goals, parentId: auth.parent.id, onboardingDone: true,
              desiredHoursPerWeek, availability,
            },
          },
        },
        include: { studentProfile: true },
      })
      child = user.studentProfile
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
        return NextResponse.json({ error: 'That username is taken — please choose another.' }, { status: 409 })
      }
      throw err
    }

    recordAudit({
      action: 'parent.child.create',
      actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role },
      targetType: 'student',
      targetId: child?.id,
      ...auditContext(request),
    })

    // Kick off tutor matching (offers). Best-effort — never fail child creation
    // over it. Requires availability to compute overlap.
    let matchStatus: string | undefined
    if (child && hasAvailability) {
      try {
        const result = await runMatching(child.id)
        matchStatus = result.status
        if (result.status === 'offered') await notifyTutorsOfOffers(child.id)
      } catch (e) {
        console.error('[parent children] matching failed', e)
      }
    }

    // Echo the credentials once so the parent can hand them to their child.
    return NextResponse.json(
      { child: child ? { id: child.id, name: child.name } : null, credentials: { username, password }, matchStatus },
      { status: 201 },
    )
  } catch (err) {
    console.error('[parent children POST]', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
