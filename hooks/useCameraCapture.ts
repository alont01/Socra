'use client'

import { useState, useCallback } from 'react'

export function useCameraCapture() {
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const captureFrame = useCallback(async (): Promise<string | null> => {
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

      return dataUrl
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied. Please allow camera permissions.')
        } else if (err.name === 'NotFoundError') {
          setError('No camera found on this device.')
        } else {
          setError(`Camera error: ${err.message}`)
        }
      } else {
        setError('Failed to capture image.')
      }
      return null
    } finally {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
      setCapturing(false)
    }
  }, [])

  return { captureFrame, capturing, error }
}
