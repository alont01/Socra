'use client'

import { useRef, useState, useCallback } from 'react'

/**
 * Object properties Fabric doesn't know about but that must survive
 * serialization.
 *
 * `socraGroup` tags the images placed by the AI "Visualize" feature so a later
 * step of a staged explanation can replace the previous one in place. Fabric
 * only serializes its own known properties, so anything not listed here is
 * silently dropped by the toObject → loadFromJSON round trip that undo/redo and
 * the student-side sync both go through — after one undo the tag was gone and
 * the next step stacked a second copy of the figure on top of the first.
 *
 * Note: in Fabric v6 `toJSON()` takes no arguments (its docstring still shows
 * the v5 form). `toObject(props)` is the one that honours this list.
 */
export const WHITEBOARD_CUSTOM_PROPS = ['socraGroup']

/**
 * Undo steps kept per session. Each entry is a full canvas JSON serialization
 * (tens of KB once a board fills up) pushed on every object add/modify/remove,
 * with no prior cap — a long session's history grew without bound in the
 * tutor's tab. 50 steps is far more than anyone actually undoes through.
 */
const MAX_HISTORY = 50

/** Serialize a canvas, keeping the custom properties above. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeCanvas(canvas: { toObject: (props?: string[]) => any }): string {
  return JSON.stringify(canvas.toObject(WHITEBOARD_CUSTOM_PROPS))
}

/**
 * Manages undo/redo history for a Fabric.js canvas.
 */
export function useWhiteboardHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fabricCanvasRef: React.MutableRefObject<any>,
  isUpdatingRef: React.MutableRefObject<boolean>,
  onCanvasStateChange?: (json: string) => void,
) {
  const historyRef = useRef<string[]>([])
  const redoStackRef = useRef<string[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const saveHistory = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || isUpdatingRef.current) return
    const json = serializeCanvas(canvas)
    historyRef.current.push(json)
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift()
    redoStackRef.current = []
    setCanUndo(true)
    setCanRedo(false)
    onCanvasStateChange?.(json)
  }, [fabricCanvasRef, isUpdatingRef, onCanvasStateChange])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initHistory = useCallback((canvas: { toObject: (props?: string[]) => any }) => {
    historyRef.current = [serializeCanvas(canvas)]
    redoStackRef.current = []
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  const undo = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || historyRef.current.length <= 1) return

    const current = historyRef.current.pop()!
    redoStackRef.current.push(current)
    const prev = historyRef.current[historyRef.current.length - 1]

    isUpdatingRef.current = true
    canvas.loadFromJSON(prev).then(() => {
      canvas.requestRenderAll()
      isUpdatingRef.current = false
      setCanUndo(historyRef.current.length > 1)
      setCanRedo(true)
      onCanvasStateChange?.(prev)
    })
  }, [fabricCanvasRef, isUpdatingRef, onCanvasStateChange])

  const redo = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || redoStackRef.current.length === 0) return

    const next = redoStackRef.current.pop()!
    historyRef.current.push(next)

    isUpdatingRef.current = true
    canvas.loadFromJSON(next).then(() => {
      canvas.requestRenderAll()
      isUpdatingRef.current = false
      setCanUndo(true)
      setCanRedo(redoStackRef.current.length > 0)
      onCanvasStateChange?.(next)
    })
  }, [fabricCanvasRef, isUpdatingRef, onCanvasStateChange])

  const clear = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    // Fabric's clear() is remove(...getObjects()), which fires 'object:removed'
    // once PER object — and Whiteboard wires that event to saveHistory(). On a
    // full board that pushed N+1 entries in one click and shifted the pre-clear
    // snapshot out past MAX_HISTORY, so Undo could never get back to it. Every
    // other mutator here (undo/redo, the AI draw) already guards with
    // isUpdatingRef; this one didn't. Suppress the per-object saves and let the
    // single explicit saveHistory() below record the cleared state, leaving the
    // pre-clear board exactly one Undo away.
    isUpdatingRef.current = true
    canvas.clear()
    canvas.backgroundColor = '#ffffff'
    canvas.requestRenderAll()
    isUpdatingRef.current = false
    saveHistory()
  }, [fabricCanvasRef, isUpdatingRef, saveHistory])

  return { canUndo, canRedo, saveHistory, initHistory, undo, redo, clear }
}
