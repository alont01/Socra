'use client'

import { useRef, useState, useCallback } from 'react'

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
    const json = JSON.stringify(canvas.toJSON())
    historyRef.current.push(json)
    redoStackRef.current = []
    setCanUndo(true)
    setCanRedo(false)
    onCanvasStateChange?.(json)
  }, [fabricCanvasRef, isUpdatingRef, onCanvasStateChange])

  const initHistory = useCallback((canvas: { toJSON: () => unknown }) => {
    historyRef.current = [JSON.stringify(canvas.toJSON())]
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
    canvas.clear()
    canvas.backgroundColor = '#ffffff'
    canvas.requestRenderAll()
    saveHistory()
  }, [fabricCanvasRef, saveHistory])

  return { canUndo, canRedo, saveHistory, initHistory, undo, redo, clear }
}
