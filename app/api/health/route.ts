import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public, unauthenticated liveness/readiness probe. Used to monitor deploys:
// `commit` echoes Render's injected build SHA, so a poller can tell when a new
// deploy is actually live (vs. the URL simply staying up on the old version).
export const dynamic = 'force-dynamic'

export async function GET() {
  let db: 'up' | 'down' = 'down'
  try {
    await prisma.$queryRaw`SELECT 1`
    db = 'up'
  } catch {
    db = 'down'
  }

  return NextResponse.json({
    status: db === 'up' ? 'ok' : 'degraded',
    commit: process.env.RENDER_GIT_COMMIT ?? 'local',
    branch: process.env.RENDER_GIT_BRANCH ?? 'local',
    db,
    time: new Date().toISOString(),
  }, { status: db === 'up' ? 200 : 503 })
}
