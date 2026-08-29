import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'
import type { Prisma } from '@prisma/client'
import { route } from '@/lib/api-handler'
import { displayIdentity, isInternalStudentEmail } from '@/lib/student-handle'

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

  // Rows store whatever address the actor authenticated with, which for a
  // parent-created child is their synthetic @students.socra.internal
  // placeholder — an internal key that reads like a real mailbox in the audit
  // table. Resolve those back to the username they actually sign in with.
  // One lookup for the page's distinct actors, not per row.
  const actorIds = [...new Set(items.map((a) => a.actorId).filter((id): id is string => !!id))]
  const usernameById = new Map(
    actorIds.length > 0
      ? (
          await prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, username: true },
          })
        ).map((u) => [u.id, u.username])
      : [],
  )

  return NextResponse.json({
    items: items.map((a) => ({
      id: a.id,
      // What the table renders. Falls back to the stored email, which is right
      // for every real account and for a failed sign-in (where the identifier
      // typed IS the username, and there is no actorId to resolve).
      actorLabel: displayIdentity(a.actorEmail, a.actorId ? usernameById.get(a.actorId) : null),
      actorEmail: isInternalStudentEmail(a.actorEmail) ? null : a.actorEmail,
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
