/**
 * @jest-environment node
 */
// A failed or content-less analysis is still written as a SessionAnalysis row
// so the pipeline stays idempotent, but its summary is an apology addressed to
// the tutor. Reporting that row as 'ready' is what put "Analysis could not be
// generated" in front of students and parents as their session recap.
jest.mock('@/lib/prisma', () => ({
  prisma: { tutoringSession: { findUnique: jest.fn() } },
}))
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }))

import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { GET } from '@/app/api/tutoring-sessions/[id]/analysis/route'

const p = prisma as unknown as { tutoringSession: { findUnique: jest.Mock } }
const mockRequireAuth = requireAuth as jest.Mock

const TUTOR_USER = 'user-tutor'
const STUDENT_USER = 'user-student'

function asUser(userId: string) {
  mockRequireAuth.mockResolvedValue({ ok: true, payload: { userId, email: 'a@b.c', role: 'TUTOR' } })
}

function session(analysis: Record<string, unknown> | null) {
  return {
    id: 's1',
    tutor: { userId: TUTOR_USER },
    student: { userId: STUDENT_USER },
    analysis,
    practiceSets: [],
  }
}

const realAnalysis = (overrides: Record<string, unknown> = {}) => ({
  status: 'ok',
  summary: 'Worked through factoring quadratics.',
  conceptsCovered: '["factoring"]',
  studentStrengths: '["common factors"]',
  studentGaps: '["leading coefficient"]',
  tutorFeedback: 'Slow down on the setup.',
  ...overrides,
})

const call = () => GET(new Request('https://socra.test/api/x'), { params: Promise.resolve({ id: 's1' }) })

beforeEach(() => {
  jest.clearAllMocks()
  asUser(TUTOR_USER)
})

describe('GET analysis — placeholder handling', () => {
  it('returns a real analysis as ready', async () => {
    p.tutoringSession.findUnique.mockResolvedValue(session(realAnalysis()))
    const body = await (await call()).json()
    expect(body.status).toBe('ready')
    expect(body.analysis.summary).toBe('Worked through factoring quadratics.')
  })

  it('reports a failed analysis as failed, with no analysis payload', async () => {
    p.tutoringSession.findUnique.mockResolvedValue(
      session(realAnalysis({ status: 'failed', summary: 'Analysis could not be generated.' })),
    )
    const body = await (await call()).json()
    expect(body.status).toBe('failed')
    // The apology must not reach any caller as a recap.
    expect(body.analysis).toBeNull()
    expect(JSON.stringify(body)).not.toContain('could not be generated')
  })

  it('reports an insufficient-content analysis distinctly', async () => {
    p.tutoringSession.findUnique.mockResolvedValue(
      session(realAnalysis({ status: 'insufficient', summary: 'Not enough was captured…' })),
    )
    const body = await (await call()).json()
    expect(body.status).toBe('insufficient')
    expect(body.analysis).toBeNull()
  })

  it('hides the placeholder from the student too, not just the tutor', async () => {
    asUser(STUDENT_USER)
    p.tutoringSession.findUnique.mockResolvedValue(
      session(realAnalysis({ status: 'failed', summary: 'Analysis could not be generated.' })),
    )
    const body = await (await call()).json()
    expect(body.status).toBe('failed')
    expect(body.analysis).toBeNull()
  })

  it('still reports a missing analysis as processing', async () => {
    p.tutoringSession.findUnique.mockResolvedValue(session(null))
    const body = await (await call()).json()
    expect(body.status).toBe('processing')
    expect(body.analysis).toBeNull()
  })

  it('refuses a user who is neither the tutor nor the student', async () => {
    asUser('someone-else')
    p.tutoringSession.findUnique.mockResolvedValue(session(realAnalysis()))
    expect((await call()).status).toBe(403)
  })
})
