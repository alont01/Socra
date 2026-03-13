'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { WhiteboardToolbar, type DrawingTool } from './WhiteboardToolbar'

interface WhiteboardProps {
  isTutor: boolean
  onCanvasStateChange?: (json: string) => void
  remoteCanvasState?: string | null
  snapshotRef?: React.MutableRefObject<(() => string | null) | null>
}

export function Whiteboard({ isTutor, onCanvasStateChange, remoteCanvasState, snapshotRef }: WhiteboardProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricCanvasRef = useRef<any>(null)
  const historyRef = useRef<string[]>([])
  const redoStackRef = useRef<string[]>([])
  const isUpdatingRef = useRef(false)
  const drawingObjRef = useRef<unknown>(null)
  const startPointRef = useRef<{ x: number; y: number } | null>(null)

  const [activeTool, setActiveTool] = useState<DrawingTool>('pen')
  const [activeColor, setActiveColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(4)
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
  }, [onCanvasStateChange])

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
      el.width = width
      el.height = height

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let canvas: any
      if (isTutor) {
        const c = new fabricModule.Canvas(el, {
          isDrawingMode: true,
          backgroundColor: '#ffffff',
          width,
          height,
        })
        c.freeDrawingBrush = new fabricModule.PencilBrush(c)
        c.freeDrawingBrush.color = '#000000'
        c.freeDrawingBrush.width = 4
        canvas = c
      } else {
        canvas = new fabricModule.StaticCanvas(el, {
          backgroundColor: '#ffffff',
          width,
          height,
        })
      }

      fabricCanvasRef.current = canvas

      // Expose snapshot function
      if (snapshotRef) {
        snapshotRef.current = () => {
          if (!fabricCanvasRef.current) return null
          return fabricCanvasRef.current.toDataURL({ format: 'png', multiplier: 1 })
        }
      }

      // Save initial state
      if (isTutor) {
        const initialJson = JSON.stringify(canvas.toJSON())
        historyRef.current = [initialJson]
      }

      // Auto-resize
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry || !fabricCanvasRef.current) return
        const { width: w, height: h } = entry.contentRect
        fabricCanvasRef.current.setDimensions({ width: w, height: h })
      })
      resizeObserver.observe(container)
    }

    init()

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose()
        fabricCanvasRef.current = null
      }
      if (snapshotRef) snapshotRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTutor])

  // Tutor: wire up canvas events for state change + shape drawing
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
  }, [isTutor, saveHistory])

  // Tutor: handle shape drawing (line, rect, circle, text) via mouse events
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !isTutor) return
    if (activeTool === 'pen' || activeTool === 'select') return

    // Disable free drawing for shape tools
    canvas.isDrawingMode = false
    canvas.selection = false

    const handleMouseDown = async (opt: { e: MouseEvent }) => {
      if (activeTool === 'text') {
        const fabricModule = await import('fabric')
        const pointer = canvas.getScenePoint(opt.e)
        const text = new fabricModule.IText('Type here', {
          left: pointer.x,
          top: pointer.y,
          fontSize: strokeWidth * 6,
          fill: activeColor,
          fontFamily: 'sans-serif',
        })
        canvas.add(text)
        canvas.setActiveObject(text)
        text.enterEditing()
        return
      }

      const pointer = canvas.getScenePoint(opt.e)
      startPointRef.current = { x: pointer.x, y: pointer.y }

      const fabricModule = await import('fabric')
      let obj: unknown = null

      if (activeTool === 'line') {
        obj = new fabricModule.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: activeColor,
          strokeWidth,
          selectable: false,
        })
      } else if (activeTool === 'rect') {
        obj = new fabricModule.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: 'transparent',
          stroke: activeColor,
          strokeWidth,
          selectable: false,
        })
      } else if (activeTool === 'circle') {
        obj = new fabricModule.Ellipse({
          left: pointer.x,
          top: pointer.y,
          rx: 0,
          ry: 0,
          fill: 'transparent',
          stroke: activeColor,
          strokeWidth,
          selectable: false,
        })
      }

      if (obj) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvas.add(obj as any)
        drawingObjRef.current = obj
      }
    }

    const handleMouseMove = (opt: { e: MouseEvent }) => {
      if (!drawingObjRef.current || !startPointRef.current) return
      const pointer = canvas.getScenePoint(opt.e)
      const start = startPointRef.current
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj = drawingObjRef.current as any

      if (activeTool === 'line') {
        obj.set({ x2: pointer.x, y2: pointer.y })
      } else if (activeTool === 'rect') {
        const left = Math.min(start.x, pointer.x)
        const top = Math.min(start.y, pointer.y)
        obj.set({
          left,
          top,
          width: Math.abs(pointer.x - start.x),
          height: Math.abs(pointer.y - start.y),
        })
      } else if (activeTool === 'circle') {
        obj.set({
          rx: Math.abs(pointer.x - start.x) / 2,
          ry: Math.abs(pointer.y - start.y) / 2,
          left: Math.min(start.x, pointer.x),
          top: Math.min(start.y, pointer.y),
        })
      }

      canvas.requestRenderAll()
    }

    const handleMouseUp = () => {
      if (drawingObjRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (drawingObjRef.current as any).selectable = true
        drawingObjRef.current = null
        startPointRef.current = null
      }
    }

    canvas.on('mouse:down', handleMouseDown)
    canvas.on('mouse:move', handleMouseMove)
    canvas.on('mouse:up', handleMouseUp)

    return () => {
      canvas.off('mouse:down', handleMouseDown)
      canvas.off('mouse:move', handleMouseMove)
      canvas.off('mouse:up', handleMouseUp)
    }
  }, [isTutor, activeTool, activeColor, strokeWidth])

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
    } else if (activeTool === 'select') {
      canvas.isDrawingMode = false
      canvas.selection = true
    }
  }, [isTutor, activeTool, activeColor, strokeWidth])

  // Student: apply remote canvas state
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || isTutor || !remoteCanvasState) return

    isUpdatingRef.current = true
    canvas.loadFromJSON(remoteCanvasState).then(() => {
      canvas.requestRenderAll()
      isUpdatingRef.current = false
    })
  }, [isTutor, remoteCanvasState])

  const handleUndo = useCallback(() => {
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
  }, [onCanvasStateChange])

  const handleRedo = useCallback(() => {
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
  }, [onCanvasStateChange])

  const handleClear = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    canvas.clear()
    canvas.backgroundColor = '#ffffff'
    canvas.requestRenderAll()
    // saveHistory is called by object:removed events, but clear may not fire them
    saveHistory()
  }, [saveHistory])

  const handleEraseSelected = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    const active = canvas.getActiveObjects()
    if (active && active.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      active.forEach((obj: any) => canvas.remove(obj))
      canvas.discardActiveObject()
      canvas.requestRenderAll()
    }
  }, [])

  const handleToolChange = useCallback((tool: DrawingTool) => {
    setActiveTool(tool)
    if (tool === 'select') {
      // When switching to select, enable selection
      const canvas = fabricCanvasRef.current
      if (canvas) {
        canvas.isDrawingMode = false
        canvas.selection = true
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-orange-100 shadow-sm overflow-hidden">
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
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClear}
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
      <div ref={containerRef} className="flex-1 relative">
        <canvas ref={canvasElRef} className="absolute inset-0" />
      </div>
    </div>
  )
}
