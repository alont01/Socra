import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// Persist the tutor's rolling live-caption buffer so post-session analysis has
// a fallback if Daily's VTT fetch comes back empty. Called by the tutor's
// client just before ending the session.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const transcript = typeof body.transcript === 'string' ? body.transcript.slice(0, 20000) : ''

    const session = await prisma.tutoringSession.findUnique({
      where: { id },
      select: { id: true, tutor: { select: { userId: true } } },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.tutor.userId !== auth.payload.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    await prisma.tutoringSession.update({ where: { id }, data: { liveTranscript: transcript } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to save transcript' }, { status: 500 })
  }
}
