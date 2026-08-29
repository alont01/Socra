import { prisma } from '@/lib/prisma'
import { clientIp } from '@/lib/client-ip'
import { createLogger } from '@/lib/logger'

const logger = createLogger('audit')

export interface AuditActor {
  id?: string | null
  email?: string | null
  role?: string | null
}

export interface RecordAuditInput {
  actor?: AuditActor | null
  action: string
  status?: 'success' | 'failure'
  targetType?: string
  targetId?: string
  ip?: string | null
  userAgent?: string | null
  /** Extra context. Never put secrets (passwords, tokens) here. */
  metadata?: Record<string, unknown>
}

/**
 * Pull client context (ip, user agent) off an incoming request.
 *
 * The IP comes from the trusted end of the `x-forwarded-for` chain (see
 * lib/client-ip.ts). Taking the first hop instead — the client-supplied end —
 * meant an attacker could write their own address into the audit log of every
 * action they took, which is worse than recording nothing.
 */
export function auditContext(request: Request): { ip: string | null; userAgent: string | null } {
  return { ip: clientIp(request), userAgent: request.headers.get('user-agent') }
}

/**
 * Append an immutable audit entry.
 *
 * Fire-and-forget: this never throws into the caller and never blocks the
 * request path. A failed write is logged and swallowed — auditing must not take
 * down the action it records.
 */
export function recordAudit(input: RecordAuditInput): void {
  prisma.auditLog
    .create({
      data: {
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        actorRole: input.actor?.role ?? null,
        action: input.action,
        status: input.status ?? 'success',
        targetType: input.targetType,
        targetId: input.targetId,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : '{}',
      },
    })
    .catch((err) => {
      // A lost audit entry is more serious than a lost metric — keep it at
      // error level — but omit the stack: during a database outage the
      // triggering request has already logged one.
      logger.error('Failed to record audit entry', undefined, {
        action: input.action,
        errorMessage: err instanceof Error ? err.message : String(err),
      })
    })
}
