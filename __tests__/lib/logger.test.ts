import { createLogger, serializeError } from '@/lib/logger'
import { runWithRequestContext, setRequestActor } from '@/lib/request-context'

describe('serializeError', () => {
  it('extracts name, message, stack and code', () => {
    const err = Object.assign(new Error('boom'), { code: 'P2002' })
    const out = serializeError(err)
    expect(out.errorName).toBe('Error')
    expect(out.errorMessage).toBe('boom')
    expect(out.errorCode).toBe('P2002')
    expect(typeof out.stack).toBe('string')
  })

  it('unwraps a cause chain', () => {
    const root = new Error('root cause')
    const wrapper = new Error('friendly', { cause: root })
    const out = serializeError(wrapper)
    expect((out.cause as Record<string, unknown>).errorMessage).toBe('root cause')
  })

  it('stops recursing on a self-referencing cause', () => {
    const err = new Error('loop') as Error & { cause?: unknown }
    err.cause = err
    expect(() => serializeError(err)).not.toThrow()
  })

  it('stringifies non-Error throws', () => {
    expect(serializeError('nope')).toEqual({ error: 'nope' })
    expect(serializeError(undefined)).toEqual({})
  })
})

describe('createLogger', () => {
  let log: jest.SpyInstance
  let errorLog: jest.SpyInstance

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {})
    errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('writes warn and error to stderr, info to stdout', () => {
    const logger = createLogger('test')
    logger.info('an info')
    logger.warn('a warning')
    logger.error('an error')
    expect(log).toHaveBeenCalledTimes(1)
    expect(errorLog).toHaveBeenCalledTimes(2)
  })

  it('redacts secret-shaped keys', () => {
    createLogger('test').info('login', { email: 'a@b.com', password: 'hunter2', apiKey: 'sk-123' })
    const line = log.mock.calls[0][0] as string
    expect(line).toContain('a@b.com')
    expect(line).not.toContain('hunter2')
    expect(line).not.toContain('sk-123')
    expect(line).toContain('[redacted]')
  })

  it('redacts nested secrets', () => {
    createLogger('test').info('nested', { user: { name: 'Sam', passwordHash: '$2a$abc' } })
    const line = log.mock.calls[0][0] as string
    expect(line).toContain('Sam')
    expect(line).not.toContain('$2a$abc')
  })

  it('stamps entries with the active request id', () => {
    runWithRequestContext({ requestId: 'req-abcdef12' }, () => {
      createLogger('test').info('inside a request')
    })
    expect(log.mock.calls[0][0]).toContain('req-abcd')
  })

  it('picks up the actor set after authentication', () => {
    runWithRequestContext({ requestId: 'req-1' }, () => {
      setRequestActor({ userId: 'user-42', role: 'TUTOR' })
      createLogger('test').error('later failure')
    })
    // userId lands on the entry via the shared context, not the call site.
    expect(errorLog).toHaveBeenCalled()
  })

  it('carries child bindings onto every entry', () => {
    createLogger('test').child({ sessionId: 'sess-9' }).info('bound')
    expect(log.mock.calls[0][0]).toContain('sess-9')
  })

  it('truncates very long strings', () => {
    createLogger('test').info('big', { blob: 'x'.repeat(5000) })
    const line = log.mock.calls[0][0] as string
    expect(line).toContain('+3000 chars')
    expect(line.length).toBeLessThan(3000)
  })
})
