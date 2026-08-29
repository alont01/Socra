/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    emailVerification: { upsert: jest.fn().mockResolvedValue({}) },
  },
}))
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  verificationEmailHtml: jest.fn(() => '<html></html>'),
}))

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { issueVerificationCode } from '@/lib/email-verification'

const mockUpsert = prisma.emailVerification.upsert as jest.Mock
const mockSendEmail = sendEmail as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('issueVerificationCode', () => {
  it('issues a code and resets attempts on a normal call', async () => {
    const userId = `user-normal-${Date.now()}`
    await issueVerificationCode(userId, 'a@example.com')

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockUpsert.mock.calls[0][0].create.attempts).toBe(0)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('stops re-issuing (and resetting attempts) once the per-account limit is hit', async () => {
    // Every reissue resets `attempts` to 0 — that's the whole vulnerability
    // this cap closes. Without it, an attacker who can call this repeatedly
    // (resend, or a failed unverified login) gets an unbounded number of
    // fresh 6-guess windows against the 6-digit code.
    const userId = `user-capped-${Date.now()}`
    for (let i = 0; i < 5; i++) {
      await issueVerificationCode(userId, 'b@example.com')
    }
    expect(mockUpsert).toHaveBeenCalledTimes(5)

    await issueVerificationCode(userId, 'b@example.com')

    // The 6th call within the hour must not touch the stored code/attempts,
    // or send another email — it's a silent no-op.
    expect(mockUpsert).toHaveBeenCalledTimes(5)
    expect(mockSendEmail).toHaveBeenCalledTimes(5)
  })

  it('caps issuance per account, not globally — a different account is unaffected', async () => {
    const capped = `user-capped-other-${Date.now()}`
    for (let i = 0; i < 5; i++) {
      await issueVerificationCode(capped, 'c@example.com')
    }
    await issueVerificationCode(capped, 'c@example.com') // 6th — no-op

    const other = `user-fresh-${Date.now()}`
    await issueVerificationCode(other, 'd@example.com')

    expect(mockUpsert).toHaveBeenCalledTimes(6) // 5 for `capped` + 1 for `other`
  })
})
