import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { processSessionPostCompletion } from '@/lib/session-processing'
import { createLogger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { route } from '@/lib/api-handler'

const logger = createLogger('retry-analysis')

/**
 * POST /api/tutoring-sessions/[id]/retry-analysis
 *
 * Allows a tutor to re-trigger analysis for a completed session
 * when the original analysis failed or produced a placeholder.
 */
export const POST = route('tutoring-sessions/[id]/retry-analysis', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const rl = rateLimit(`retry-analysis:${auth.payload.userId}`, { maxRequests: 3, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const session = await prisma.tutoringSession.findUnique({
    where: { id },
    include: { tutor: true, analysis: true },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.tutor.userId !== auth.payload.userId) {
    return NextResponse.json({ error: 'Only tutor can retry analysis' }, { status: 403 })
  }
  if (session.status !== 'completed') {
    return NextResponse.json({ error: 'Session must be completed first' }, { status: 400 })
  }

  // Delete existing analysis and any DRAFT practice sets so the pipeline can
  // re-run cleanly. Assigned homework is preserved — it may already have
  // student attempts, and those must not be destroyed by a re-analysis.
  if (session.analysis) {
    await prisma.sessionAnalysis.delete({
      where: { tutoringSessionId: id },
    })
  }
  await prisma.practiceSet.deleteMany({
    where: { tutoringSessionId: id, status: 'draft' },
  })
  logger.info('Deleted existing analysis and draft practice sets for retry', { sessionId: id })

  // Re-trigger the pipeline
  processSessionPostCompletion(id).catch((err) =>
    logger.error('Retry post-processing failed', err, { sessionId: id })
  )

  return NextResponse.json({ success: true, message: 'Analysis re-triggered' })
})
