'use client'

import { useState } from 'react'
import { useCameraCapture } from '@/hooks/useCameraCapture'
import { useToast } from '@/hooks/useToast'

interface CaptureNotesButtonProps {
  sessionId: string
}

export function CaptureNotesButton({ sessionId }: CaptureNotesButtonProps) {
  const { captureFrame, capturing } = useCameraCapture()
  const { toast } = useToast()
  const [preview, setPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [captureCount, setCaptureCount] = useState(0)

  const handleCapture = async () => {
    // Read the error off this call's result, not the hook's `error` state —
    // that state lags a render behind, so the FIRST denial (state still at
    // its initial null) showed no toast at all; only a second tap surfaced
    // the previous attempt's message.
    const { dataUrl, error } = await captureFrame()
    if (dataUrl) {
      setPreview(dataUrl)
    } else if (error) {
      toast(error, 'error')
    }
  }

  const handleSend = async () => {
    if (!preview) return
    setSending(true)
    try {
      // Strip data URL prefix to get raw base64
      const base64 = preview.replace(/^data:image\/\w+;base64,/, '')
      const res = await fetch(`/api/tutoring-sessions/${sessionId}/capture-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      })

      if (res.ok) {
        setCaptureCount((c) => c + 1)
        toast('Notes captured successfully!', 'success')
        setPreview(null)
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to capture notes', 'error')
      }
    } catch {
      toast('Failed to send captured notes', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleRetake = () => {
    setPreview(null)
  }

  // Preview overlay
  if (preview) {
    return (
      <div className="absolute bottom-4 right-4 z-10 bg-white rounded-xl shadow-lg p-3 w-72">
        {/* Base64 data URL — next/image can't optimize these and needs fixed
            dimensions, so a plain <img> is the right tool here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt="Captured notes preview"
          className="w-full rounded-lg mb-3"
        />
        <div className="flex gap-2">
          <button
            onClick={handleRetake}
            disabled={sending}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Retake
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {sending ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : null}
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    )
  }

  // Floating capture button
  return (
    <button
      onClick={handleCapture}
      disabled={capturing}
      className="absolute bottom-4 right-4 z-10 flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-full shadow-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
    >
      {capturing ? (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
      <span className="text-sm font-medium">
        {capturing ? 'Capturing...' : 'Capture Notes'}
      </span>
      {captureCount > 0 && (
        <span className="bg-white text-orange-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {captureCount}
        </span>
      )}
    </button>
  )
}
