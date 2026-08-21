import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { estimateCost } from '@/lib/metrics'
import { safeJsonParse } from '@/lib/json'
import { route } from '@/lib/api-handler'

export const GET = route('admin/metrics', async (request: Request) => {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  // Window in minutes, clamped to [5min, 30 days]. Default 24h.
  const windowMinutes = Math.min(
    Math.max(Number(searchParams.get('window')) || 1440, 5),
    60 * 24 * 30,
  )
  const since = new Date(Date.now() - windowMinutes * 60_000)
  const aiWhere = { category: 'ai', createdAt: { gte: since } }

  const [
    overall,
    errorCount,
    byOp,
    byOpErrors,
    tokensByModel,
    sessionsProcessed,
    transcriptSuccess,
    transcriptFailed,
    recentErrors,
  ] = await Promise.all([
    prisma.systemEvent.aggregate({
      where: aiWhere,
      _count: { _all: true },
      _avg: { durationMs: true },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    prisma.systemEvent.count({ where: { ...aiWhere, success: false } }),
    prisma.systemEvent.groupBy({
      by: ['name'],
      where: aiWhere,
      _count: { _all: true },
      _avg: { durationMs: true },
    }),
    prisma.systemEvent.groupBy({
      by: ['name'],
      where: { ...aiWhere, success: false },
      _count: { _all: true },
    }),
    prisma.systemEvent.groupBy({
      by: ['model'],
      where: aiWhere,
      _sum: { inputTokens: true, outputTokens: true },
    }),
    prisma.systemEvent.count({ where: { name: 'session.processed', createdAt: { gte: since } } }),
    prisma.systemEvent.count({ where: { category: 'transcript', success: true, createdAt: { gte: since } } }),
    prisma.systemEvent.count({ where: { category: 'transcript', success: false, createdAt: { gte: since } } }),
    prisma.systemEvent.findMany({
      where: { level: 'error', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, name: true, category: true, createdAt: true, metadata: true },
    }),
  ])

  const totalCalls = overall._count._all
  const errorsByOp = new Map(byOpErrors.map((r) => [r.name, r._count._all]))

  const estCostUsd = tokensByModel.reduce(
    (sum, r) => sum + estimateCost(r.model, r._sum.inputTokens ?? 0, r._sum.outputTokens ?? 0),
    0,
  )

  return NextResponse.json({
    windowMinutes,
    generatedAt: new Date().toISOString(),
    ai: {
      totalCalls,
      errorCount,
      successRate: totalCalls > 0 ? (totalCalls - errorCount) / totalCalls : null,
      avgLatencyMs: Math.round(overall._avg.durationMs ?? 0),
      totalInputTokens: overall._sum.inputTokens ?? 0,
      totalOutputTokens: overall._sum.outputTokens ?? 0,
      estCostUsd,
      byOperation: byOp
        .map((r) => ({
          name: r.name,
          count: r._count._all,
          errors: errorsByOp.get(r.name) ?? 0,
          avgLatencyMs: Math.round(r._avg.durationMs ?? 0),
        }))
        .sort((a, b) => b.count - a.count),
      byModel: tokensByModel.map((r) => ({
        model: r.model ?? 'unknown',
        inputTokens: r._sum.inputTokens ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        estCostUsd: estimateCost(r.model, r._sum.inputTokens ?? 0, r._sum.outputTokens ?? 0),
      })),
    },
    pipeline: {
      sessionsProcessed,
      transcript: { success: transcriptSuccess, failed: transcriptFailed },
    },
    recentErrors: recentErrors.map((e) => {
      const meta = safeJsonParse<Record<string, unknown>>(e.metadata, {})
      return {
        id: e.id,
        name: e.name,
        category: e.category,
        createdAt: e.createdAt,
        message: typeof meta.error === 'string' ? meta.error : null,
      }
    }),
  })
})
