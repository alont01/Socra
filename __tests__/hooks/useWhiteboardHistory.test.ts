/**
 * @jest-environment node
 */
import { serializeCanvas, WHITEBOARD_CUSTOM_PROPS } from '@/hooks/useWhiteboardHistory'

// Minimal stand-in for a Fabric canvas: Fabric's real toObject copies the
// listed extra properties off each object and drops everything else, which is
// the behaviour that matters here.
function fakeCanvas(objects: Record<string, unknown>[]) {
  return {
    toObject(propertiesToInclude: string[] = []) {
      return {
        version: '6.0.0',
        objects: objects.map((o) => {
          const base: Record<string, unknown> = { type: o.type, left: o.left, top: o.top }
          for (const key of propertiesToInclude) {
            if (o[key] !== undefined) base[key] = o[key]
          }
          return base
        }),
      }
    },
  }
}

describe('serializeCanvas', () => {
  // The AI "Visualize" feature tags placed images so a later step of a staged
  // explanation replaces the previous one. Undo/redo and the student-side sync
  // both round-trip through this serializer, so losing the tag here means the
  // next step stacks a duplicate figure instead of replacing the last.
  it('keeps socraGroup through serialization', () => {
    const json = serializeCanvas(fakeCanvas([{ type: 'image', left: 20, top: 40, socraGroup: 'viz-abc' }]))
    expect(JSON.parse(json).objects[0].socraGroup).toBe('viz-abc')
  })

  it('leaves untagged objects untouched', () => {
    const json = serializeCanvas(fakeCanvas([{ type: 'path', left: 0, top: 0 }]))
    const obj = JSON.parse(json).objects[0]
    expect(obj).not.toHaveProperty('socraGroup')
    expect(obj.type).toBe('path')
  })

  it('passes the custom-property list to toObject', () => {
    const spy = jest.fn().mockReturnValue({ objects: [] })
    serializeCanvas({ toObject: spy })
    expect(spy).toHaveBeenCalledWith(WHITEBOARD_CUSTOM_PROPS)
  })

  it('produces a string JSON.parse can round-trip', () => {
    const json = serializeCanvas(fakeCanvas([{ type: 'image', left: 1, top: 2, socraGroup: 'g' }]))
    expect(typeof json).toBe('string')
    expect(() => JSON.parse(json)).not.toThrow()
  })
})
