/**
 * @jest-environment node
 */
import { PATCH } from '@/app/api/tutoring-sessions/[id]/route'

jest.mock('@/lib/metrics', () => ({ recordEvent: jest.fn(), trackedCall: jest.fn() }))
jest.mock('@/lib/daily', () => ({ createRoom: jest.fn() }))
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(),
}))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    tutoringSession: { findUnique: jest.fn(), update: jest.fn() },
  },
}))

const { requireAuth } = jest.requireMock('@/lib/api-auth') as { requireAuth: jest.Mock }
const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: { tutoringSession: { findUnique: jest.Mock; update: jest.Mock } }
}

const TUTOR_USER = 'user_tutor_1'

const patch = (body: unknown) =>
  PATCH(
    new Request('https://socra.test/api/tutoring-sessions/sess_1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'sess_1' }) },
  )

const sessionRow = (over: Record<string, unknown> = {}) => ({
  id: 'sess_1',
  status: 'active',
  startedAt: new Date('2026-08-29T12:00:00Z'),
  endedAt: null,
  dailyRoomName: 'session-sess_1',
  tutor: { userId: TUTOR_USER },
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  requireAuth.mockResolvedValue({
    ok: true,
    payload: { userId: TUTOR_USER, email: 't@socra.test', role: 'TUTOR' },
  })
  prisma.tutoringSession.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'sess_1', ...data }),
  )
})
afterEach(() => jest.restoreAllMocks())

describe('PATCH /api/tutoring-sessions/[id] — status transitions', () => {
  it('refuses to complete a session, and says where completion actually lives', async () => {
    // Completing here wrote `status` without `endedAt` and without running the
    // post-session pipeline. Billing requires endedAt, and the stale-session
    // sweeper only scans `active` — so the session became invisible to both and
    // the family was never charged for a lesson that happened.
    prisma.tutoringSession.findUnique.mockResolvedValue(sessionRow())

    const res = await patch({ status: 'completed' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/\/end/)
    expect(prisma.tutoringSession.update).not.toHaveBeenCalled()
  })

  it('refuses completion from a scheduled session too', async () => {
    prisma.tutoringSession.findUnique.mockResolvedValue(sessionRow({ status: 'scheduled', startedAt: null }))

    const res = await patch({ status: 'completed' })

    expect(res.status).toBe(400)
    expect(prisma.tutoringSession.update).not.toHaveBeenCalled()
  })

  it('stamps endedAt when a started session is cancelled', async () => {
    // Cancelled sessions never bill (billing only reads `completed`), but a
    // terminal row with a null endedAt is indistinguishable from a live one.
    prisma.tutoringSession.findUnique.mockResolvedValue(sessionRow())

    const res = await patch({ status: 'cancelled' })

    expect(res.status).toBe(200)
    const data = prisma.tutoringSession.update.mock.calls[0][0].data
    expect(data.status).toBe('cancelled')
    expect(data.endedAt).toBeInstanceOf(Date)
  })

  it('leaves endedAt alone when cancelling a session that never started', async () => {
    prisma.tutoringSession.findUnique.mockResolvedValue(sessionRow({ status: 'scheduled', startedAt: null }))

    await patch({ status: 'cancelled' })

    expect(prisma.tutoringSession.update.mock.calls[0][0].data.endedAt).toBeUndefined()
  })

  it('still rejects a transition out of a terminal state', async () => {
    prisma.tutoringSession.findUnique.mockResolvedValue(sessionRow({ status: 'completed' }))

    const res = await patch({ status: 'cancelled' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Cannot transition/)
  })

  it('leaves ordinary note edits working', async () => {
    prisma.tutoringSession.findUnique.mockResolvedValue(sessionRow())

    const res = await patch({ tutorNotes: 'covered the quadratic formula' })

    expect(res.status).toBe(200)
    expect(prisma.tutoringSession.update.mock.calls[0][0].data).toEqual({
      tutorNotes: 'covered the quadratic formula',
    })
  })
})
