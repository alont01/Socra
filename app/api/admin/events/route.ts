import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'
import { pruneOldEvents } from '@/lib/metrics'
import type { Prisma } from '@prisma/client'

// Retention: prune events older than ?days (default 90). Admin-only; safe to
// wire to a scheduled job.
export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const days = Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 90)
  const removed = await pruneOldEvents(days)
  return NextResponse.json({ removed, days })
}

// Browsable view over persisted SystemEvent telemetry (AI calls, pipeline,
// errors) for the admin log viewer.
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(Math.max(Number(searchParams.get('pageSize')) || 50, 1), 200)
    const category = searchParams.get('category')?.trim() || undefined
    const level = searchParams.get('level')?.trim() || undefined
    const q = searchParams.get('q')?.trim() || undefined
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: Prisma.SystemEventWhereInput = {}
    if (category) where.category = category
    if (level === 'info' || level === 'warn' || level === 'error') where.level = level
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      }
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
        { metadata: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.systemEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.systemEvent.count({ where }),
    ])

    return NextResponse.json({
      items: items.map((e) => ({
        id: e.id,
        category: e.category,
        name: e.name,
        level: e.level,
        success: e.success,
        durationMs: e.durationMs,
        model: e.model,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        createdAt: e.createdAt,
        meta: safeJsonParse<Record<string, unknown>>(e.metadata, {}),
        requestPreview: e.requestPreview,
        responsePreview: e.responsePreview,
      })),
      total,
      page,
      pageSize,
    })
  } catch (err) {
    console.error('[admin-events]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
