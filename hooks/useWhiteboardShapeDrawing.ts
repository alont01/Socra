'use client'

import { useEffect, useRef } from 'react'
import type { DrawingTool } from '@/components/session/WhiteboardToolbar'

/**
 * Handles mouse events for shape drawing tools (line, rect, circle, text) on a Fabric.js canvas.
 */
export function useWhiteboardShapeDrawing(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fabricCanvasRef: React.MutableRefObject<any>,
  isTutor: boolean,
  activeTool: DrawingTool,
  activeColor: string,
  strokeWidth: number,
  canvasReady: boolean,
) {
  const drawingObjRef = useRef<unknown>(null)
  const startPointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !isTutor) return
    if (activeTool === 'pen' || activeTool === 'eraser' || activeTool === 'select') return

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
  }, [fabricCanvasRef, isTutor, activeTool, activeColor, strokeWidth, canvasReady])
}
