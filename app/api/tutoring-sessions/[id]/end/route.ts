import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { processSessionPostCompletion } from '@/lib/session-processing'
import { createLogger } from '@/lib/logger'
import { recordAudit, auditContext } from '@/lib/audit'
import { route } from '@/lib/api-handler'

const logger = createLogger('session-end')

export const POST = route('tutoring-sessions/[id]/end', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const session = await prisma.tutoringSession.findUnique({
    where: { id },
    include: { tutor: true },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.tutor.userId !== auth.payload.userId) {
    return NextResponse.json({ error: 'Only tutor can end session' }, { status: 403 })
  }
  if (session.status === 'completed') {
    return NextResponse.json({ session })
  }

  // Atomic conditional update: only transition to completed if not already completed.
  // This prevents double-processing from concurrent end requests.
  const result = await prisma.tutoringSession.updateMany({
    where: { id, status: { not: 'completed' } },
    data: {
      status: 'completed',
      endedAt: new Date(),
    },
  })

  if (result.count === 0) {
    // Another request completed it first — return current state
    const current = await prisma.tutoringSession.findUnique({ where: { id } })
    return NextResponse.json({ session: current })
  }

  const updated = await prisma.tutoringSession.findUnique({ where: { id } })

  recordAudit({
    action: 'session.end',
    actor: { id: auth.payload.userId, email: auth.payload.email, role: auth.payload.role },
    targetType: 'session',
    targetId: id,
    ...auditContext(request),
  })

  // Fire-and-forget post-session processing (idempotent — checks for existing analysis)
  processSessionPostCompletion(id).catch((err) =>
    logger.error('Post-processing failed', err, { sessionId: id })
  )

  return NextResponse.json({ session: updated })
})
