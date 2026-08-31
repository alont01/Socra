/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    tutoringSession: { findMany: jest.fn(), updateMany: jest.fn() },
  },
}))
jest.mock('@/lib/metrics', () => ({ recordEvent: jest.fn() }))
jest.mock('@/lib/session-processing', () => ({ processSessionPostCompletion: jest.fn().mockResolvedValue(undefined) }))

import { prisma } from '@/lib/prisma'
import { processSessionPostCompletion } from '@/lib/session-processing'
import { sweepStaleSessions, retryStuckAnalyses } from '@/lib/session-sweeper'
import { config } from '@/lib/config'

const p = prisma as unknown as {
  tutoringSession: { findMany: jest.Mock; updateMany: jest.Mock }
}
const mockProcess = processSessionPostCompletion as jest.Mock

const NOW = new Date('2026-08-20T18:00:00Z')
/** Well past config.session.staleAfterHours. */
const LONG_AGO = new Date('2026-08-20T06:00:00Z')

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  p.tutoringSession.updateMany.mockResolvedValue({ count: 1 })
})
afterEach(() => jest.restoreAllMocks())

describe('sweepStaleSessions', () => {
  it('does nothing when there are no stale sessions', async () => {
    p.tutoringSession.findMany.mockResolvedValue([])

    const result = await sweepStaleSessions(NOW)

    expect(result).toEqual({ scanned: 0, closed: [], failed: [], more: false })
    expect(p.tutoringSession.updateMany).not.toHaveBeenCalled()
  })

  it('only scans active sessions older than the stale cutoff', async () => {
    p.tutoringSession.findMany.mockResolvedValue([])

    await sweepStaleSessions(NOW)

    const where = p.tutoringSession.findMany.mock.calls[0][0].where
    expect(where.status).toBe('active')
    const cutoff = where.startedAt.lt as Date
    expect(cutoff.getTime()).toBe(NOW.getTime() - config.session.staleAfterHours * 3_600_000)
  })

  it('ends a stale session at its capped duration, not at "now"', async () => {
    p.tutoringSession.findMany.mockResolvedValue([
      { id: 'sess1', startedAt: LONG_AGO, scheduledMinutes: 60, tutorId: 't1', studentId: 'st1' },
    ])

    const result = await sweepStaleSessions(NOW)

    expect(result.closed).toEqual(['sess1'])
    const data = p.tutoringSession.updateMany.mock.calls[0][0].data
    // 60 scheduled + 10 grace = 70 minutes after it started. When the sweeper
    // happens to run must never change what the family pays.
    expect(data.endedAt).toEqual(new Date(LONG_AGO.getTime() + 70 * 60_000))
    expect(data.status).toBe('completed')
    expect(data.autoClosed).toBe(true)
  })

  it('respects each session\'s own scheduled length', async () => {
    p.tutoringSession.findMany.mockResolvedValue([
      { id: 'short', startedAt: LONG_AGO, scheduledMinutes: 30, tutorId: 't1', studentId: 'st1' },
      { id: 'long', startedAt: LONG_AGO, scheduledMinutes: 120, tutorId: 't1', studentId: 'st2' },
    ])

    await sweepStaleSessions(NOW)

    expect(p.tutoringSession.updateMany.mock.calls[0][0].data.endedAt).toEqual(
      new Date(LONG_AGO.getTime() + 40 * 60_000),
    )
    expect(p.tutoringSession.updateMany.mock.calls[1][0].data.endedAt).toEqual(
      new Date(LONG_AGO.getTime() + 130 * 60_000),
    )
  })

  it('only closes a session that is still active', async () => {
    p.tutoringSession.findMany.mockResolvedValue([
      { id: 'sess1', startedAt: LONG_AGO, scheduledMinutes: 60, tutorId: 't1', studentId: 'st1' },
    ])

    await sweepStaleSessions(NOW)

    // The conditional write is what makes a tutor ending the session mid-sweep
    // the winner, and makes a concurrent sweep a no-op.
    expect(p.tutoringSession.updateMany.mock.calls[0][0].where).toEqual({ id: 'sess1', status: 'active' })
  })

  it('skips post-processing when the session was already closed by someone else', async () => {
    p.tutoringSession.findMany.mockResolvedValue([
      { id: 'sess1', startedAt: LONG_AGO, scheduledMinutes: 60, tutorId: 't1', studentId: 'st1' },
    ])
    p.tutoringSession.updateMany.mockResolvedValue({ count: 0 })

    const result = await sweepStaleSessions(NOW)

    expect(result.closed).toEqual([])
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('runs the post-session pipeline for each session it closes', async () => {
    p.tutoringSession.findMany.mockResolvedValue([
      { id: 'sess1', startedAt: LONG_AGO, scheduledMinutes: 60, tutorId: 't1', studentId: 'st1' },
    ])

    await sweepStaleSessions(NOW)

    expect(mockProcess).toHaveBeenCalledWith('sess1')
  })

  it('keeps sweeping after one session fails', async () => {
    p.tutoringSession.findMany.mockResolvedValue([
      { id: 'bad', startedAt: LONG_AGO, scheduledMinutes: 60, tutorId: 't1', studentId: 'st1' },
      { id: 'good', startedAt: LONG_AGO, scheduledMinutes: 60, tutorId: 't1', studentId: 'st2' },
    ])
    p.tutoringSession.updateMany
      .mockRejectedValueOnce(new Error('deadlock detected'))
      .mockResolvedValueOnce({ count: 1 })

    const result = await sweepStaleSessions(NOW)

    expect(result.closed).toEqual(['good'])
    expect(result.failed).toEqual([{ sessionId: 'bad', error: 'deadlock detected' }])
    expect(result.scanned).toBe(2)
  })

  it('does not fail the sweep when post-processing rejects', async () => {
    p.tutoringSession.findMany.mockResolvedValue([
      { id: 'sess1', startedAt: LONG_AGO, scheduledMinutes: 60, tutorId: 't1', studentId: 'st1' },
    ])
    mockProcess.mockRejectedValue(new Error('analysis exploded'))

    const result = await sweepStaleSessions(NOW)

    // The session is correctly closed for billing regardless of the AI pipeline.
    expect(result.closed).toEqual(['sess1'])
    expect(result.failed).toEqual([])
  })
})

describe('sweepStaleSessions batching', () => {
  /** More stale sessions than one run is allowed to close. */
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `sess${i}`,
      startedAt: LONG_AGO,
      scheduledMinutes: 60,
      tutorId: 't1',
      studentId: `st${i}`,
    }))

  it('caps how many sessions one run closes and reports that more remain', async () => {
    // The query fetches MAX_PER_RUN + 1 to detect the overflow.
    p.tutoringSession.findMany.mockResolvedValue(many(26))

    const result = await sweepStaleSessions(NOW)

    // A backlog must drain over several runs rather than firing 26 AI
    // pipelines at once.
    expect(result.closed).toHaveLength(25)
    expect(result.more).toBe(true)
    expect(p.tutoringSession.findMany.mock.calls[0][0].take).toBe(26)
  })

  it('reports no overflow when the batch is not full', async () => {
    p.tutoringSession.findMany.mockResolvedValue(many(3))

    const result = await sweepStaleSessions(NOW)

    expect(result.closed).toHaveLength(3)
    expect(result.more).toBe(false)
  })

  it('processes the oldest sessions first', async () => {
    p.tutoringSession.findMany.mockResolvedValue([])
    await sweepStaleSessions(NOW)
    expect(p.tutoringSession.findMany.mock.calls[0][0].orderBy).toEqual({ startedAt: 'asc' })
  })
})

describe('retryStuckAnalyses', () => {
  it('does nothing when there are no stuck sessions', async () => {
    p.tutoringSession.findMany.mockResolvedValue([])

    const result = await retryStuckAnalyses(NOW)

    expect(result).toEqual({ scanned: 0, retried: [], more: false })
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('only scans completed sessions with a student, no analysis, past the stale cutoff', async () => {
    p.tutoringSession.findMany.mockResolvedValue([])

    await retryStuckAnalyses(NOW)

    const where = p.tutoringSession.findMany.mock.calls[0][0].where
    expect(where.status).toBe('completed')
    expect(where.studentId).toEqual({ not: null })
    expect(where.analysis).toBeNull()
    const cutoff = where.endedAt.lt as Date
    expect(cutoff.getTime()).toBe(NOW.getTime() - config.session.staleAnalysisAfterMinutes * 60_000)
  })

  it('re-fires the pipeline for every stuck session found', async () => {
    p.tutoringSession.findMany.mockResolvedValue([{ id: 'sess1' }, { id: 'sess2' }])

    const result = await retryStuckAnalyses(NOW)

    expect(result.retried).toEqual(['sess1', 'sess2'])
    expect(mockProcess).toHaveBeenCalledWith('sess1')
    expect(mockProcess).toHaveBeenCalledWith('sess2')
  })

  it('does not let one failed retry stop the rest', async () => {
    p.tutoringSession.findMany.mockResolvedValue([{ id: 'bad' }, { id: 'good' }])
    mockProcess.mockRejectedValueOnce(new Error('still broken')).mockResolvedValueOnce(undefined)

    const result = await retryStuckAnalyses(NOW)

    // Reported as attempted even though the pipeline itself later rejects —
    // this call is fire-and-forget, same as the sweeper above, so both are
    // recorded as retried and a genuinely still-broken one is picked up again
    // next run.
    expect(result.retried).toEqual(['bad', 'good'])
  })

  it('caps how many sessions one run retries and reports that more remain', async () => {
    const many = Array.from({ length: 26 }, (_, i) => ({ id: `sess${i}` }))
    p.tutoringSession.findMany.mockResolvedValue(many)

    const result = await retryStuckAnalyses(NOW)

    expect(result.retried).toHaveLength(25)
    expect(result.more).toBe(true)
  })
})
