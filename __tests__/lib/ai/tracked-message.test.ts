/**
 * @jest-environment node
 */
jest.mock('@/lib/metrics', () => ({ recordEvent: jest.fn() }))

import { recordEvent } from '@/lib/metrics'
import { anthropic, trackedMessage } from '@/lib/ai/client'

// Spy on the shared client object rather than mocking the module: trackedMessage
// closes over this exact `anthropic` singleton, so a module-level mock of the
// export would leave the real one in place and issue live HTTP calls.
let mockCreate: jest.SpyInstance
const mockRecord = recordEvent as jest.Mock

const params = {
  model: 'claude-sonnet-4-6',
  max_tokens: 100,
  messages: [{ role: 'user' as const, content: 'hi' }],
}

const message = {
  content: [{ type: 'text', text: 'hello' }],
  usage: { input_tokens: 10, output_tokens: 5 },
}

/**
 * The SDK's `.create()` returns an APIPromise — awaitable, and also carrying
 * `.withResponse()` for the raw HTTP response. Reproduce both surfaces.
 */
function apiPromise(data: unknown, headers: Record<string, string>) {
  const promise = Promise.resolve(data) as Promise<unknown> & { withResponse: () => Promise<unknown> }
  promise.withResponse = async () => ({ data, response: { headers: new Headers(headers) } })
  return promise
}

/** The last metadata object handed to recordEvent. */
const lastMetadata = () => mockRecord.mock.calls.at(-1)![0].metadata as Record<string, unknown>

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockCreate = jest.spyOn(anthropic.messages, 'create')
})
afterEach(() => jest.restoreAllMocks())

describe('trackedMessage rate-limit capture', () => {
  it('records remaining quota from the response headers', async () => {
    mockCreate.mockReturnValue(
      apiPromise(message, {
        'anthropic-ratelimit-requests-remaining': '3821',
        'anthropic-ratelimit-requests-limit': '4000',
        'anthropic-ratelimit-input-tokens-remaining': '190000',
        'anthropic-ratelimit-requests-reset': '2026-08-21T12:00:00Z',
      }),
    )

    const result = await trackedMessage('analysis', params)

    // The response still passes through unchanged — this is telemetry, not a
    // behavior change.
    expect(result).toBe(message)
    expect(lastMetadata()).toEqual(
      expect.objectContaining({
        requestsRemaining: 3821,
        requestsLimit: 4000,
        inputTokensRemaining: 190000,
        resetsAt: '2026-08-21T12:00:00Z',
      }),
    )
  })

  it('omits headers the provider did not send rather than storing nulls', async () => {
    mockCreate.mockReturnValue(apiPromise(message, { 'anthropic-ratelimit-requests-remaining': '10' }))

    await trackedMessage('analysis', params)

    const metadata = lastMetadata()
    expect(metadata).toEqual({ requestsRemaining: 10 })
    expect('tokensRemaining' in metadata).toBe(false)
  })

  it('ignores a non-numeric header value', async () => {
    mockCreate.mockReturnValue(apiPromise(message, { 'anthropic-ratelimit-requests-remaining': 'n/a' }))

    await trackedMessage('analysis', params)

    expect('requestsRemaining' in lastMetadata()).toBe(false)
  })

  it('still records token usage alongside the quota headers', async () => {
    mockCreate.mockReturnValue(apiPromise(message, {}))

    await trackedMessage('analysis', params)

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, inputTokens: 10, outputTokens: 5, model: 'claude-sonnet-4-6' }),
    )
  })

  it('captures retry-after and status from a 429 and rethrows', async () => {
    const rateLimited = Object.assign(new Error('rate limited'), {
      status: 429,
      headers: new Headers({ 'retry-after': '30', 'anthropic-ratelimit-requests-remaining': '0' }),
    })
    mockCreate.mockReturnValue({ withResponse: () => Promise.reject(rateLimited) })

    await expect(trackedMessage('analysis', params)).rejects.toThrow('rate limited')

    // Knowing a ceiling was hit, and when it clears, is the whole point of
    // recording this on the failure path too.
    expect(lastMetadata()).toEqual(
      expect.objectContaining({ status: 429, retryAfter: 30, requestsRemaining: 0 }),
    )
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ success: false, level: 'error' }))
  })

  it('records a failure without headers when the error carries none', async () => {
    mockCreate.mockReturnValue({ withResponse: () => Promise.reject(new Error('socket hang up')) })

    await expect(trackedMessage('analysis', params)).rejects.toThrow('socket hang up')

    expect(lastMetadata()).toEqual(expect.objectContaining({ error: 'socket hang up' }))
  })
})
