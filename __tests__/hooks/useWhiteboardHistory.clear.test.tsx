import { renderHook, act } from '@testing-library/react'
import { useWhiteboardHistory } from '@/hooks/useWhiteboardHistory'

/**
 * Fake Fabric canvas whose clear() reproduces the real v6 behaviour:
 * Canvas.clear() is remove(...getObjects()), and Collection.remove() fires
 * 'object:removed' once PER object.
 */
function fakeCanvas(objectCount: number) {
  let objects = Array.from({ length: objectCount }, (_, i) => ({ id: `o${i}` }))
  const listeners: Record<string, Array<() => void>> = {}
  return {
    getObjects: () => objects,
    toObject: () => ({ version: '6.0.0', objects: objects.map((o) => ({ ...o })) }),
    clear() {
      for (const o of [...objects]) {
        objects = objects.filter((x) => x !== o)
        ;(listeners['object:removed'] || []).forEach((fn) => fn())
      }
    },
    loadFromJSON: jest.fn((json: string) => {
      objects = JSON.parse(json).objects
      return Promise.resolve()
    }),
    requestRenderAll: jest.fn(),
    on: (evt: string, fn: () => void) => { (listeners[evt] ||= []).push(fn) },
    off: () => {},
    backgroundColor: '',
  }
}

describe('useWhiteboardHistory.clear', () => {
  // Regression: Whiteboard wires canvas 'object:removed' -> saveHistory(), and
  // fabric's clear() fires that once per object. Without guarding clear() with
  // isUpdatingRef, one Clear click pushed N+1 history entries and shifted the
  // pre-clear board out past MAX_HISTORY, so Undo could never reach it again.
  it('records exactly one history entry, regardless of how many objects were on the board', () => {
    const canvas = fakeCanvas(12)
    const canvasRef = { current: canvas as unknown as Parameters<typeof useWhiteboardHistory>[0]['current'] }
    const isUpdatingRef = { current: false }
    const onChange = jest.fn()

    const { result } = renderHook(() =>
      useWhiteboardHistory(canvasRef as never, isUpdatingRef, onChange),
    )

    // Mirror Whiteboard.tsx: every object:removed triggers a history save.
    canvas.on('object:removed', () => result.current.saveHistory())

    act(() => { result.current.initHistory(canvas as never) })
    onChange.mockClear()

    act(() => { result.current.clear() })

    // The 12 per-object 'object:removed' saves must be suppressed; only the one
    // explicit post-clear save runs.
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(isUpdatingRef.current).toBe(false) // guard flag restored
  })
})
