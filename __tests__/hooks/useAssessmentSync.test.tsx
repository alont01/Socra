import { renderHook, act } from '@testing-library/react'
import { useAssessmentSync } from '@/hooks/useAssessmentSync'
import type { DailyCall } from '@daily-co/daily-js'

/** Minimal Daily stand-in: records sends and lets a test deliver a message. */
function fakeCall() {
  const handlers: Record<string, ((e: unknown) => void)[]> = {}
  const sent: unknown[] = []
  const frame = {
    sendAppMessage: (msg: unknown) => { sent.push(msg) },
    on: (evt: string, fn: (e: unknown) => void) => { (handlers[evt] ||= []).push(fn) },
    off: (evt: string, fn: (e: unknown) => void) => {
      handlers[evt] = (handlers[evt] || []).filter((h) => h !== fn)
    },
  } as unknown as DailyCall
  const deliver = (data: unknown) => {
    for (const fn of handlers['app-message'] || []) fn({ data })
  }
  const listenerCount = () => (handlers['app-message'] || []).length
  return { frame, sent, deliver, listenerCount }
}

describe('useAssessmentSync', () => {
  it('routes each signal to its own callback', () => {
    const call = fakeCall()
    const onChanged = jest.fn()
    const onGenerating = jest.fn()
    renderHook(() => useAssessmentSync({ callFrame: call.frame, onChanged, onGenerating }))

    act(() => { call.deliver({ type: 'assessment:generating' }) })
    expect(onGenerating).toHaveBeenCalledTimes(1)
    expect(onChanged).not.toHaveBeenCalled()

    act(() => { call.deliver({ type: 'assessment:changed' }) })
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onGenerating).toHaveBeenCalledTimes(1)
  })

  it('broadcasts both signals', () => {
    const call = fakeCall()
    const { result } = renderHook(() =>
      useAssessmentSync({ callFrame: call.frame, onChanged: jest.fn() }),
    )
    act(() => { result.current.notifyGenerating() })
    act(() => { result.current.notifyChanged() })
    expect(call.sent).toEqual([
      { type: 'assessment:generating' },
      { type: 'assessment:changed' },
    ])
  })

  it('ignores unrelated app messages', () => {
    const call = fakeCall()
    const onChanged = jest.fn()
    const onGenerating = jest.fn()
    renderHook(() => useAssessmentSync({ callFrame: call.frame, onChanged, onGenerating }))
    act(() => { call.deliver({ type: 'whiteboard:changed' }) })
    act(() => { call.deliver(undefined) })
    expect(onChanged).not.toHaveBeenCalled()
    expect(onGenerating).not.toHaveBeenCalled()
  })

  it('tolerates a missing onGenerating handler', () => {
    const call = fakeCall()
    renderHook(() => useAssessmentSync({ callFrame: call.frame, onChanged: jest.fn() }))
    expect(() => act(() => { call.deliver({ type: 'assessment:generating' }) })).not.toThrow()
  })

  it('does not send before the call frame exists', () => {
    const { result } = renderHook(() =>
      useAssessmentSync({ callFrame: null, onChanged: jest.fn() }),
    )
    expect(() => act(() => { result.current.notifyGenerating() })).not.toThrow()
  })

  it('unsubscribes on unmount', () => {
    const call = fakeCall()
    const { unmount } = renderHook(() =>
      useAssessmentSync({ callFrame: call.frame, onChanged: jest.fn() }),
    )
    expect(call.listenerCount()).toBe(1)
    unmount()
    expect(call.listenerCount()).toBe(0)
  })
})
