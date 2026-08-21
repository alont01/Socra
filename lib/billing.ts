// Monthly billing: turns completed-session records into a per-family hours +
// amount breakdown. The aggregation math is pure and unit-tested; only
// getMonthlyBilling touches the database.

import { prisma } from '@/lib/prisma'
import { config } from '@/lib/config'

export interface SessionHoursRow {
  parentId: string
  parentName: string
  parentEmail: string
  studentId: string
  studentName: string
  startedAt: Date
  endedAt: Date
  /** Intended length of the session; caps what it can bill. */
  scheduledMinutes: number
  /** Ended by the stale-session sweeper rather than by the tutor. */
  autoClosed: boolean
}

export interface ChildHours {
  studentId: string
  studentName: string
  hours: number
}

export interface ParentBilling {
  parentId: string
  parentName: string
  parentEmail: string
  children: ChildHours[]
  totalHours: number
  rateUsd: number
  amountCents: number
  /**
   * How many of these sessions were closed by the sweeper rather than by a
   * tutor. Non-zero means the hours are an estimate capped at the booked
   * length — worth an eye before charging the family.
   */
  autoClosedSessions: number
}

/** Wall-clock duration of one session in hours (never negative, e.g. reversed data). */
export function sessionHours(startedAt: Date, endedAt: Date): number {
  const ms = endedAt.getTime() - startedAt.getTime()
  if (!Number.isFinite(ms)) return 0
  return Math.max(0, ms / 3_600_000)
}

/**
 * Hours a session may charge for.
 *
 * `endedAt` is written when the tutor clicks End, so wall-clock duration
 * overstates any session left open afterwards. Billing therefore charges the
 * lesser of what actually happened and what was booked (plus a small grace for
 * a session that naturally runs a few minutes long).
 *
 * Short sessions bill their actual length — the cap only ever reduces.
 */
export function billableHours(
  startedAt: Date,
  endedAt: Date,
  scheduledMinutes: number,
  graceMinutes: number = config.billing.graceMinutes,
): number {
  const actual = sessionHours(startedAt, endedAt)

  // A missing or nonsensical scheduled length must not disable the cap, or a
  // single bad row bills unbounded. Fall back to the default session length.
  const scheduled =
    Number.isFinite(scheduledMinutes) && scheduledMinutes > 0
      ? scheduledMinutes
      : config.billing.defaultSessionMinutes

  const cap = (scheduled + Math.max(0, graceMinutes)) / 60
  return Math.min(actual, cap)
}

/**
 * Group per-session rows into one billing line per parent (with a line per
 * child underneath), at the given hourly rate. Hours are rounded to the
 * nearest cent-equivalent precision (2 decimal places) before pricing so the
 * displayed hours and the billed amount always agree.
 */
export function aggregateBilling(rows: SessionHoursRow[], rateUsd: number): ParentBilling[] {
  const byParent = new Map<
    string,
    { name: string; email: string; autoClosed: number; children: Map<string, { name: string; hours: number }> }
  >()

  for (const row of rows) {
    const hours = billableHours(row.startedAt, row.endedAt, row.scheduledMinutes)
    if (hours <= 0) continue

    if (!byParent.has(row.parentId)) {
      byParent.set(row.parentId, { name: row.parentName, email: row.parentEmail, autoClosed: 0, children: new Map() })
    }
    const parent = byParent.get(row.parentId)!
    if (row.autoClosed) parent.autoClosed++
    if (!parent.children.has(row.studentId)) {
      parent.children.set(row.studentId, { name: row.studentName, hours: 0 })
    }
    parent.children.get(row.studentId)!.hours += hours
  }

  const result: ParentBilling[] = []
  for (const [parentId, p] of byParent) {
    const children: ChildHours[] = [...p.children.entries()].map(([studentId, c]) => ({
      studentId,
      studentName: c.name,
      hours: Math.round(c.hours * 100) / 100,
    }))
    const totalHours = Math.round(children.reduce((s, c) => s + c.hours, 0) * 100) / 100
    result.push({
      parentId,
      parentName: p.name,
      parentEmail: p.email,
      children,
      totalHours,
      rateUsd,
      amountCents: Math.round(totalHours * rateUsd * 100),
      autoClosedSessions: p.autoClosed,
    })
  }
  return result.sort((a, b) => b.totalHours - a.totalHours)
}

/** [start, end) of the calendar month containing `date`, in UTC. */
export function monthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  return { start, end }
}

/** Per-family hours + amount for every parent with billable sessions in the period. */
export async function getMonthlyBilling(periodStart: Date, periodEnd: Date): Promise<ParentBilling[]> {
  const sessions = await prisma.tutoringSession.findMany({
    where: {
      status: 'completed',
      startedAt: { not: null, gte: periodStart, lt: periodEnd },
      endedAt: { not: null },
      student: { parentId: { not: null } },
    },
    select: {
      startedAt: true,
      endedAt: true,
      scheduledMinutes: true,
      autoClosed: true,
      student: {
        select: {
          id: true,
          name: true,
          parent: { select: { id: true, name: true, user: { select: { email: true } } } },
        },
      },
    },
  })

  const rows: SessionHoursRow[] = sessions
    .filter((s) => s.startedAt && s.endedAt && s.student?.parent)
    .map((s) => ({
      parentId: s.student!.parent!.id,
      parentName: s.student!.parent!.name,
      parentEmail: s.student!.parent!.user.email,
      studentId: s.student!.id,
      studentName: s.student!.name,
      startedAt: s.startedAt!,
      endedAt: s.endedAt!,
      scheduledMinutes: s.scheduledMinutes,
      autoClosed: s.autoClosed,
    }))

  return aggregateBilling(rows, config.billing.hourlyRateUsd)
}
