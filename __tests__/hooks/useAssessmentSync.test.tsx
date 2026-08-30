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
    renderHook(() => useAssessmentSync({ callFrame: call.frame, isTutor: true, onChanged, onGenerating }))

    act(() => { call.deliver({ type: 'assessment:generating' }) })
    expect(onGenerating).toHaveBeenCalledTimes(1)
    expect(onChanged).not.toHaveBeenCalled()

    act(() => { call.deliver({ type: 'assessment:changed' }) })
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onGenerating).toHaveBeenCalledTimes(1)
  })

  it('broadcasts both signals', () => {
    const call = fakeCall()
    // isTutor: true so mount doesn't also fire the student's auto
    // 'assessment:request-state' send into the same `sent` array.
    const { result } = renderHook(() =>
      useAssessmentSync({ callFrame: call.frame, isTutor: true, onChanged: jest.fn() }),
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
    renderHook(() => useAssessmentSync({ callFrame: call.frame, isTutor: true, onChanged, onGenerating }))
    act(() => { call.deliver({ type: 'whiteboard:changed' }) })
    act(() => { call.deliver(undefined) })
    expect(onChanged).not.toHaveBeenCalled()
    expect(onGenerating).not.toHaveBeenCalled()
  })

  it('tolerates a missing onGenerating handler', () => {
    const call = fakeCall()
    renderHook(() => useAssessmentSync({ callFrame: call.frame, isTutor: true, onChanged: jest.fn() }))
    expect(() => act(() => { call.deliver({ type: 'assessment:generating' }) })).not.toThrow()
  })

  it('does not send before the call frame exists', () => {
    const { result } = renderHook(() =>
      useAssessmentSync({ callFrame: null, isTutor: false, onChanged: jest.fn() }),
    )
    expect(() => act(() => { result.current.notifyGenerating() })).not.toThrow()
  })

  it('unsubscribes on unmount', () => {
    const call = fakeCall()
    const { unmount } = renderHook(() =>
      useAssessmentSync({ callFrame: call.frame, isTutor: true, onChanged: jest.fn() }),
    )
    expect(call.listenerCount()).toBe(1)
    unmount()
    expect(call.listenerCount()).toBe(0)
  })

  // A tutor start/override/end fires notifyChanged() while the student's
  // callFrame isn't ready yet (still connecting to Daily) — that broadcast
  // goes nowhere and nothing on either side reports it as failed, since the
  // tutor's own view already updated from the API response. The student side
  // asks for the current state on mount so a missed broadcast is caught up.
  it('student requests state on mount; tutor replies with a fresh changed signal', () => {
    const student = fakeCall()
    renderHook(() => useAssessmentSync({ callFrame: student.frame, isTutor: false, onChanged: jest.fn() }))
    expect(student.sent).toEqual([{ type: 'assessment:request-state' }])

    const tutor = fakeCall()
    const onChanged = jest.fn()
    renderHook(() => useAssessmentSync({ callFrame: tutor.frame, isTutor: true, onChanged }))
    act(() => { tutor.deliver({ type: 'assessment:request-state' }) })
    expect(tutor.sent).toEqual([{ type: 'assessment:changed' }])
    // The tutor's own onChanged must not fire off its own reply.
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('a student ignores a request-state message (only the tutor replies)', () => {
    const call = fakeCall()
    renderHook(() => useAssessmentSync({ callFrame: call.frame, isTutor: false, onChanged: jest.fn() }))
    call.sent.length = 0 // clear the mount-time auto-request
    act(() => { call.deliver({ type: 'assessment:request-state' }) })
    expect(call.sent).toEqual([])
  })
})
