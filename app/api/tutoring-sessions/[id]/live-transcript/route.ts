import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { route } from '@/lib/api-handler'

// Persist the tutor's rolling live-caption buffer so post-session analysis has
// a fallback if Daily's VTT fetch comes back empty. Called by the tutor's
// client just before ending the session.
export const POST = route(
  'tutoring-sessions/[id]/live-transcript',
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const transcript = typeof body.transcript === 'string' ? body.transcript.slice(0, 20000) : ''

    const session = await prisma.tutoringSession.findUnique({
      where: { id },
      select: { id: true, status: true, tutor: { select: { userId: true } } },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.tutor.userId !== auth.payload.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    // The normal caller (endSession, client-side) always sends this before the
    // session is marked completed. A write reaching here after that means a
    // stale tab or a race with the sweeper — a completed session's transcript
    // has already fed the analysis pipeline and must not be overwritten.
    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Session is not active' }, { status: 400 })
    }

    await prisma.tutoringSession.update({ where: { id }, data: { liveTranscript: transcript } })
    return NextResponse.json({ ok: true })
  },
  { errorMessage: 'Failed to save transcript' },
)
