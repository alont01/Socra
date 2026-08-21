/**
 * @jest-environment node
 */
jest.mock('@/lib/metrics', () => ({
  // Pass-through so a throw inside the callback still propagates, as the real
  // trackedCall does after recording the failure.
  trackedCall: jest.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()),
}))

const mockSend = jest.fn()
jest.mock('resend', () => ({ Resend: jest.fn(() => ({ emails: { send: mockSend } })) }))

import { trackedCall } from '@/lib/metrics'
import { sendEmail } from '@/lib/email'

const mockTrackedCall = trackedCall as jest.Mock
const ORIGINAL_KEY = process.env.RESEND_API_KEY

const input = { to: 'parent@example.com', subject: 'Test', html: '<p>hi</p>' }

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  process.env.RESEND_API_KEY = 're_test_key'
})
afterEach(() => {
  jest.restoreAllMocks()
  if (ORIGINAL_KEY === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = ORIGINAL_KEY
})

describe('sendEmail', () => {
  it('returns true on a genuinely successful send', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email_123' }, error: null })
    expect(await sendEmail(input)).toBe(true)
  })

  it('returns false when Resend rejects the message', async () => {
    // Resend resolves with an error object rather than throwing — reporting
    // this as success is how a password reset silently never arrives.
    mockSend.mockResolvedValue({ data: null, error: { name: 'invalid_api_key', message: 'API key is invalid' } })

    expect(await sendEmail(input)).toBe(false)
  })

  it('returns false when the quota is exhausted', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'daily_quota_exceeded', message: 'You have reached your daily sending quota' },
    })

    expect(await sendEmail(input)).toBe(false)
  })

  it('records a rejected send as a failed call, not a successful one', async () => {
    mockSend.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'Invalid recipient' } })

    await sendEmail(input)

    // The callback must throw so telemetry files this under failures.
    const callback = mockTrackedCall.mock.calls[0][1] as () => Promise<unknown>
    await expect(callback()).rejects.toThrow('Invalid recipient')
  })

  it('returns false when the SDK throws outright', async () => {
    mockSend.mockRejectedValue(new Error('socket hang up'))
    expect(await sendEmail(input)).toBe(false)
  })

  it('returns false without calling Resend when no API key is configured', async () => {
    delete process.env.RESEND_API_KEY

    expect(await sendEmail(input)).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
  })
})
