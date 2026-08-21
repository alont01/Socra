import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'
import type { Prisma } from '@prisma/client'
import { route } from '@/lib/api-handler'

export const GET = route('admin/audit', async (request: Request) => {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(Math.max(Number(searchParams.get('pageSize')) || 50, 1), 200)
  const action = searchParams.get('action')?.trim() || undefined
  const status = searchParams.get('status')?.trim() || undefined
  const q = searchParams.get('q')?.trim() || undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where: Prisma.AuditLogWhereInput = {}
  if (action) where.action = action
  if (status === 'success' || status === 'failure') where.status = status
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }
  if (q) {
    where.OR = [
      { actorEmail: { contains: q, mode: 'insensitive' } },
      { action: { contains: q, mode: 'insensitive' } },
      { targetId: { contains: q, mode: 'insensitive' } },
      { metadata: { contains: q, mode: 'insensitive' } },
      { ip: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [items, total, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
    // Distinct action list for the filter dropdown.
    prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
      take: 100,
    }),
  ])

  return NextResponse.json({
    items: items.map((a) => ({
      id: a.id,
      actorEmail: a.actorEmail,
      actorRole: a.actorRole,
      action: a.action,
      status: a.status,
      targetType: a.targetType,
      targetId: a.targetId,
      ip: a.ip,
      userAgent: a.userAgent,
      createdAt: a.createdAt,
      meta: safeJsonParse<Record<string, unknown>>(a.metadata, {}),
    })),
    total,
    page,
    pageSize,
    actions: actions.map((a) => a.action),
  })
})
