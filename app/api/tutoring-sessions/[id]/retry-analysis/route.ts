import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { processSessionPostCompletion } from '@/lib/session-processing'
import { createLogger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'

const logger = createLogger('retry-analysis')

/**
 * POST /api/tutoring-sessions/[id]/retry-analysis
 *
 * Allows a tutor to re-trigger analysis for a completed session
 * when the original analysis failed or produced a placeholder.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    // Delete existing analysis AND practice sets so the pipeline can fully re-run
    // without creating duplicates or double-counting mastery
    if (session.analysis) {
      await prisma.sessionAnalysis.delete({
        where: { tutoringSessionId: id },
      })
    }
    await prisma.practiceSet.deleteMany({
      where: { tutoringSessionId: id },
    })
    logger.info('Deleted existing analysis and practice sets for retry', { sessionId: id })

    // Re-trigger the pipeline
    processSessionPostCompletion(id).catch((err) =>
      logger.error('Retry post-processing failed', err, { sessionId: id })
    )

    return NextResponse.json({ success: true, message: 'Analysis re-triggered' })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
