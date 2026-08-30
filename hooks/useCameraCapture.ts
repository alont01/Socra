'use client'

import { useState, useCallback } from 'react'

interface CaptureResult {
  dataUrl: string | null
  /** Set alongside a null dataUrl — read this directly, not the hook's
   * stale `error` state, which reflects the PREVIOUS call until this
   * component re-renders (a caller reading it in the same tick after
   * `await captureFrame()` sees last call's value, or null on the first
   * attempt, so a first-time denial produced no toast at all). */
  error: string | null
}

export function useCameraCapture() {
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const captureFrame = useCallback(async (): Promise<CaptureResult> => {
    setCapturing(true)
    setError(null)

    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })

      const video = document.createElement('video')
      video.srcObject = stream
      video.playsInline = true
      await video.play()

      // Wait a frame for the video to render
      await new Promise((resolve) => requestAnimationFrame(resolve))

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas context')

      ctx.drawImage(video, 0, 0)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

      return { dataUrl, error: null }
    } catch (err) {
      let message: string
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          message = 'Camera access denied. Please allow camera permissions.'
        } else if (err.name === 'NotFoundError') {
          message = 'No camera found on this device.'
        } else {
          message = `Camera error: ${err.message}`
        }
      } else {
        message = 'Failed to capture image.'
      }
      setError(message)
      return { dataUrl: null, error: message }
    } finally {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
      setCapturing(false)
    }
  }, [])

  return { captureFrame, capturing, error }
}
