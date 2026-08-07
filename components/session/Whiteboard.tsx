'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { WhiteboardToolbar, type DrawingTool } from './WhiteboardToolbar'
import { useWhiteboardHistory } from '@/hooks/useWhiteboardHistory'
import { useWhiteboardShapeDrawing } from '@/hooks/useWhiteboardShapeDrawing'

interface WhiteboardProps {
  isTutor: boolean
  onCanvasStateChange?: (json: string) => void
  remoteCanvasState?: string | null
  snapshotRef?: React.MutableRefObject<(() => string | null) | null>
  // Imperative hook for the AI "Visualize" feature: given a list of SVG strings,
  // render them onto the tutor's canvas as images (which then sync to the student).
  drawRef?: React.MutableRefObject<((svgs: string[]) => Promise<void>) | null>
}

export function Whiteboard({ isTutor, onCanvasStateChange, remoteCanvasState, snapshotRef, drawRef }: WhiteboardProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fabricCanvasRef = useRef<any>(null)
  const isUpdatingRef = useRef(false)

  const [activeTool, setActiveTool] = useState<DrawingTool>('pen')
  const [activeColor, setActiveColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [canvasReady, setCanvasReady] = useState(false)

  const {
    canUndo, canRedo,
    saveHistory, initHistory,
    undo, redo, clear,
  } = useWhiteboardHistory(fabricCanvasRef, isUpdatingRef, onCanvasStateChange)

  useWhiteboardShapeDrawing(fabricCanvasRef, isTutor, activeTool, activeColor, strokeWidth, canvasReady)

  // Initialize Fabric.js canvas
  useEffect(() => {
    let disposed = false
    let resizeObserver: ResizeObserver | null = null

    async function init() {
      const fabricModule = await import('fabric')
      if (disposed) return

      const el = canvasElRef.current
      const container = containerRef.current
      if (!el || !container) return

      const { width, height } = container.getBoundingClientRect()
      const canvasHeight = height * 3
      el.width = width
      el.height = canvasHeight

      let canvas: any
      if (isTutor) {
        const c = new fabricModule.Canvas(el, {
          isDrawingMode: true,
          backgroundColor: '#ffffff',
          width,
          height: canvasHeight,
        })
        c.freeDrawingBrush = new fabricModule.PencilBrush(c)
        c.freeDrawingBrush.color = '#000000'
        c.freeDrawingBrush.width = 4
        canvas = c
      } else {
        canvas = new fabricModule.StaticCanvas(el, {
          backgroundColor: '#ffffff',
          width,
          height: canvasHeight,
        })
      }

      fabricCanvasRef.current = canvas
      setCanvasReady(true)

      // Expose snapshot function
      if (snapshotRef) {
        snapshotRef.current = () => {
          if (!fabricCanvasRef.current) return null
          return fabricCanvasRef.current.toDataURL({ format: 'png', multiplier: 1 })
        }
      }

      // Expose the AI draw function (tutor only — it mutates the live canvas).
      if (drawRef && isTutor) {
        drawRef.current = async (svgs: string[]) => {
          const c = fabricCanvasRef.current
          if (!c) return
          const fb: any = await import('fabric')
          const ImageCls = fb.FabricImage || fb.Image
          // Batch: suppress per-object sync, then fire one saveHistory at the end.
          isUpdatingRef.current = true
          let top = 20
          for (const svg of svgs) {
            const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
            try {
              const img = await ImageCls.fromURL(url)
              img.set({ left: 20, top, selectable: true })
              c.add(img)
              top += (img.height || 240) + 16
            } catch {
              /* skip an item that fails to render */
            }
          }
          c.requestRenderAll()
          isUpdatingRef.current = false
          saveHistory()
        }
      }

      // Save initial state
      if (isTutor) {
        initHistory(canvas)
      }

      // Auto-resize width only (height is extended for scrolling)
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry || !fabricCanvasRef.current) return
        const { width: w } = entry.contentRect
        fabricCanvasRef.current.setDimensions({ width: w })
      })
      resizeObserver.observe(container)
    }

    init()

    return () => {
      disposed = true
      setCanvasReady(false)
      resizeObserver?.disconnect()
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose()
        fabricCanvasRef.current = null
      }
      if (snapshotRef) snapshotRef.current = null
      if (drawRef) drawRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTutor])

  // Tutor: wire up canvas events for state change
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !isTutor) return

    const onObjectChange = () => saveHistory()

    canvas.on('object:added', onObjectChange)
    canvas.on('object:modified', onObjectChange)
    canvas.on('object:removed', onObjectChange)

    return () => {
      canvas.off('object:added', onObjectChange)
      canvas.off('object:modified', onObjectChange)
      canvas.off('object:removed', onObjectChange)
    }
  }, [isTutor, saveHistory, canvasReady])

  // Update brush settings when tool/color/width change
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !isTutor) return

    if (activeTool === 'pen') {
      canvas.isDrawingMode = true
      if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = activeColor
        canvas.freeDrawingBrush.width = strokeWidth
      }
    } else if (activeTool === 'eraser') {
      canvas.isDrawingMode = true
      if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = '#ffffff'
        canvas.freeDrawingBrush.width = strokeWidth * 4
      }
    } else if (activeTool === 'select') {
      canvas.isDrawingMode = false
      canvas.selection = true
    }
  }, [isTutor, activeTool, activeColor, strokeWidth, canvasReady])

  // Student: apply remote canvas state
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || isTutor || !remoteCanvasState) return

    isUpdatingRef.current = true
    canvas.loadFromJSON(remoteCanvasState).then(() => {
      canvas.requestRenderAll()
      isUpdatingRef.current = false
    }).catch(() => {
      isUpdatingRef.current = false
    })
  }, [isTutor, remoteCanvasState])

  const handleEraseSelected = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    const active = canvas.getActiveObjects()
    if (active && active.length > 0) {
      active.forEach((obj: any) => canvas.remove(obj))
      canvas.discardActiveObject()
      canvas.requestRenderAll()
    }
  }, [])

  const handleToolChange = useCallback((tool: DrawingTool) => {
    setActiveTool(tool)
    if (tool === 'select') {
      const canvas = fabricCanvasRef.current
      if (canvas) {
        canvas.isDrawingMode = false
        canvas.selection = true
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft overflow-hidden">
      {isTutor && (
        <div className="p-2 border-b border-stone-100">
          <WhiteboardToolbar
            activeTool={activeTool}
            activeColor={activeColor}
            strokeWidth={strokeWidth}
            canUndo={canUndo}
            canRedo={canRedo}
            onToolChange={handleToolChange}
            onColorChange={setActiveColor}
            onStrokeWidthChange={setStrokeWidth}
            onUndo={undo}
            onRedo={redo}
            onClear={clear}
          />
          {activeTool === 'select' && (
            <button
              onClick={handleEraseSelected}
              className="mt-1 text-xs text-red-500 hover:text-red-600 px-2 py-0.5"
            >
              Delete selected
            </button>
          )}
        </div>
      )}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <canvas ref={canvasElRef} />
      </div>
    </div>
  )
}
