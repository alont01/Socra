/**
 * @jest-environment node
 */
import { NextResponse } from 'next/server'
import { ApiError, mapError, route, REQUEST_ID_HEADER } from '@/lib/api-handler'
import { currentRequestId } from '@/lib/request-context'

jest.mock('@/lib/metrics', () => ({ recordEvent: jest.fn() }))

const { recordEvent } = jest.requireMock('@/lib/metrics') as { recordEvent: jest.Mock }

const req = (url = 'https://socra.test/api/thing', init?: RequestInit) => new Request(url, init)

describe('mapError', () => {
  it('uses an ApiError status and message verbatim', () => {
    expect(mapError(new ApiError(409, 'Already claimed'))).toEqual({ status: 409, message: 'Already claimed' })
  })

  it('turns a malformed JSON body into a 400 instead of a 500', () => {
    expect(mapError(new SyntaxError('Unexpected token'))).toEqual({ status: 400, message: 'Invalid JSON body' })
  })

  it('maps known Prisma codes', () => {
    expect(mapError({ code: 'P2002' }).status).toBe(409)
    expect(mapError({ code: 'P2025' }).status).toBe(404)
    expect(mapError({ code: 'P2003' }).status).toBe(400)
  })

  it('never leaks an unexpected error message to the client', () => {
    const leaky = new Error('connect ECONNREFUSED postgres://user:pw@10.0.0.1:5432')
    expect(mapError(leaky)).toEqual({ status: 500, message: 'Internal server error' })
  })
})

describe('route', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    recordEvent.mockClear()
  })
  afterEach(() => jest.restoreAllMocks())

  it('passes a successful response through and tags it with a request id', async () => {
    const handler = route('thing', async () => NextResponse.json({ ok: true }))
    const res = await handler(req(), {} as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get(REQUEST_ID_HEADER)).toMatch(/[0-9a-f-]{36}/)
  })

  it('reuses an upstream correlation id', async () => {
    const handler = route('thing', async () => NextResponse.json({ ok: true }))
    const res = await handler(req('https://socra.test/api/thing', { headers: { [REQUEST_ID_HEADER]: 'trace-123' } }), {} as never)
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe('trace-123')
  })

  it('exposes the request id to the handler through async context', async () => {
    let seen: string | undefined
    const handler = route('thing', async () => {
      seen = currentRequestId()
      return NextResponse.json({ ok: true })
    })
    const res = await handler(req('https://socra.test/api/thing', { headers: { [REQUEST_ID_HEADER]: 'trace-abc' } }), {} as never)
    expect(seen).toBe('trace-abc')
    expect(res.status).toBe(200)
  })

  it('converts an unexpected throw into a 500 with the request id in the body', async () => {
    const handler = route('thing', async () => {
      throw new Error('database on fire')
    })
    const res = await handler(req(), {} as never)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal server error')
    expect(body.requestId).toBeTruthy()
    expect(body.error).not.toContain('fire')
  })

  it('records a telemetry event for a 500', async () => {
    const handler = route('thing', async () => {
      throw new Error('boom')
    })
    await handler(req(), {} as never)
    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({ category: 'error', name: 'http.500' }))
  })

  it('applies a route-specific error message to unexpected failures only', async () => {
    const handler = route(
      'thing',
      async () => {
        throw new Error('internal detail')
      },
      { errorMessage: 'Could not start the assessment.' },
    )
    expect((await (await handler(req(), {} as never)).json()).error).toBe('Could not start the assessment.')

    const explicit = route(
      'thing',
      async () => {
        throw new ApiError(400, 'Topic is required')
      },
      { errorMessage: 'Could not start the assessment.' },
    )
    const res = await explicit(req(), {} as never)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Topic is required')
  })

  it('does not record a telemetry event for a thrown 4xx', async () => {
    const handler = route('thing', async () => {
      throw new ApiError(404, 'Session not found')
    })
    const res = await handler(req(), {} as never)
    expect(res.status).toBe(404)
    expect(recordEvent).not.toHaveBeenCalled()
  })

  it('rethrows Next.js control-flow errors so redirects still work', async () => {
    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/auth;307;' })
    const handler = route('thing', async () => {
      throw redirectError
    })
    await expect(handler(req(), {} as never)).rejects.toBe(redirectError)
    expect(recordEvent).not.toHaveBeenCalled()
  })

  it('flags a 500 the handler returned itself', async () => {
    const handler = route('thing', async () => NextResponse.json({ error: 'nope' }, { status: 500 }))
    const res = await handler(req(), {} as never)
    expect(res.status).toBe(500)
    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({ name: 'http.500' }))
  })
})
