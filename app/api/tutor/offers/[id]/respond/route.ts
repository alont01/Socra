import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { offerRespondSchema, parseBody } from '@/lib/validations'
import { runMatching } from '@/lib/matching'
import { notifyTutorsOfOffers, notifyParentOfMatch } from '@/lib/match-notify'
import { recordAudit, auditContext } from '@/lib/audit'
import { recordEvent } from '@/lib/metrics'

// Tutor accepts or declines a match offer.
//
// Accept is first-wins: we claim the offer (pending→accepted) and create the
// active pairing. A DB partial-unique index ("one active tutor per student")
// makes the pairing insert the true arbiter — a concurrent second accept fails
// there and is reported as "already taken".
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTutor()
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const parsed = parseBody(offerRespondSchema, body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const offer = await prisma.tutorMatchOffer.findUnique({
    where: { id },
    select: { id: true, tutorId: true, studentId: true, status: true, expiresAt: true },
  })
  if (!offer || offer.tutorId !== auth.tutor.id) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }
  if (offer.status !== 'pending') {
    return NextResponse.json({ error: 'This offer is no longer open' }, { status: 409 })
  }
  if (offer.expiresAt < new Date()) {
    await prisma.tutorMatchOffer.update({ where: { id }, data: { status: 'expired', respondedAt: new Date() } })
    return NextResponse.json({ error: 'This offer has expired' }, { status: 410 })
  }

  const ctx = auditContext(request)

  if (parsed.data.action === 'decline') {
    await prisma.tutorMatchOffer.update({ where: { id }, data: { status: 'declined', respondedAt: new Date() } })
    recordAudit({ action: 'match.decline', actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role }, targetType: 'student', targetId: offer.studentId, ...ctx })
    // Advance the waterfall: if no offers remain live, offer the next batch.
    try {
      const result = await runMatching(offer.studentId)
      if (result.status === 'offered') await notifyTutorsOfOffers(offer.studentId)
    } catch (e) {
      console.error('[offer respond] re-match after decline failed', e)
    }
    return NextResponse.json({ ok: true, result: 'declined' })
  }

  // ── Accept ──────────────────────────────────────────────────────────────
  const desired = await prisma.studentProfile.findUnique({
    where: { id: offer.studentId },
    select: { desiredHoursPerWeek: true, name: true },
  })
  const hoursPerWeek = desired?.desiredHoursPerWeek ?? 1

  try {
    await prisma.$transaction(async (tx) => {
      // Claim the offer.
      const claim = await tx.tutorMatchOffer.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'accepted', respondedAt: new Date() },
      })
      if (claim.count === 0) throw new Error('OFFER_TAKEN')

      // Create the active pairing. The partial-unique index rejects this if the
      // student already has an active tutor (P2002) → first-wins.
      await tx.tutorStudent.upsert({
        where: { tutorId_studentId: { tutorId: offer.tutorId, studentId: offer.studentId } },
        create: { tutorId: offer.tutorId, studentId: offer.studentId, hoursPerWeek, status: 'active' },
        update: { status: 'active', hoursPerWeek },
      })

      // Withdraw sibling pending offers for this student.
      await tx.tutorMatchOffer.updateMany({
        where: { studentId: offer.studentId, status: 'pending', NOT: { id } },
        data: { status: 'withdrawn', respondedAt: new Date() },
      })
    })
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
    const msg = err instanceof Error ? err.message : ''
    if (code === 'P2002' || msg === 'OFFER_TAKEN') {
      // Someone else got there first — roll our claimed offer back to withdrawn.
      await prisma.tutorMatchOffer.updateMany({ where: { id, status: 'accepted' }, data: { status: 'withdrawn' } }).catch(() => {})
      return NextResponse.json({ error: 'This student was just matched with another tutor.' }, { status: 409 })
    }
    console.error('[offer respond] accept failed', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  recordAudit({ action: 'match.accept', actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role }, targetType: 'student', targetId: offer.studentId, ...ctx })
  recordEvent({ category: 'match', name: 'match.accepted', success: true, metadata: { studentId: offer.studentId, tutorId: offer.tutorId } })

  // Notify the parent (best-effort).
  try {
    await notifyParentOfMatch(offer.studentId, auth.tutor.name)
  } catch (e) {
    console.error('[offer respond] parent notify failed', e)
  }

  return NextResponse.json({ ok: true, result: 'accepted', student: desired?.name })
}
