'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { DailyCall, DailyEventObjectAppMessage } from '@daily-co/daily-js'

type WhiteboardMessageType =
  | 'whiteboard:start'
  | 'whiteboard:stop'
  | 'whiteboard:chunk'
  | 'whiteboard:request-state'

// A whiteboard snapshot is the full fabric.js canvas JSON. It can be tens of KB
// once a board fills up, but Daily caps a single app-message at ~4KB — so we
// split every snapshot into ordered chunks and reassemble them on the receiver.
// Daily's data channel is reliable and ordered, so chunks arrive intact and in
// sequence; a newer snapshot's first chunk supersedes any older incomplete one.
interface WhiteboardChunk {
  type: 'whiteboard:chunk'
  mid: string // snapshot id — all chunks of one snapshot share it
  i: number // chunk index
  n: number // total chunks
  data: string
}

interface WhiteboardSignal {
  type: 'whiteboard:start' | 'whiteboard:stop' | 'whiteboard:request-state'
}

type WhiteboardMessage = WhiteboardChunk | WhiteboardSignal

// Keep each chunk's serialized message comfortably under Daily's ~4KB limit,
// leaving headroom for the envelope and UTF-8 expansion.
const CHUNK_SIZE = 2000

interface UseWhiteboardSyncOptions {
  callFrame: DailyCall | null
  isTutor: boolean
  // Whether the tutor currently has the board toggled on. Only meaningful for
  // the tutor side — used solely to answer 'whiteboard:request-state'
  // truthfully (see below).
  isActive?: boolean
  onRemoteStateReceived?: (json: string) => void
  onWhiteboardStarted?: () => void
  onWhiteboardStopped?: () => void
}

function chunkString(s: string, size: number): string[] {
  if (s.length === 0) return ['']
  const out: string[] = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out
}

export function useWhiteboardSync({
  callFrame,
  isTutor,
  isActive = false,
  onRemoteStateReceived,
  onWhiteboardStarted,
  onWhiteboardStopped,
}: UseWhiteboardSyncOptions) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestCanvasJsonRef = useRef<string | null>(null)
  const seqRef = useRef(0)
  // Reassembly buffer for the snapshot currently being received (student side).
  const bufRef = useRef<{ mid: string; n: number; parts: string[]; count: number } | null>(null)
  // Mirrors `isActive` into a ref so the app-message handler (registered once
  // per callFrame identity, not re-subscribed on every toggle) always reads
  // the current value rather than whatever it was when the effect last ran.
  const isActiveRef = useRef(isActive)
  useEffect(() => { isActiveRef.current = isActive }, [isActive])

  // Split a full-canvas snapshot into chunks and broadcast them (tutor only).
  const sendSnapshot = useCallback(
    (json: string) => {
      if (!callFrame || !isTutor) return
      const parts = chunkString(json, CHUNK_SIZE)
      const mid = `${Date.now().toString(36)}-${(seqRef.current++).toString(36)}`
      for (let i = 0; i < parts.length; i++) {
        const msg: WhiteboardChunk = { type: 'whiteboard:chunk', mid, i, n: parts.length, data: parts[i] }
        callFrame.sendAppMessage(msg, '*')
      }
    },
    [callFrame, isTutor],
  )

  const sendCanvasState = useCallback(
    (json: string) => {
      if (!callFrame || !isTutor) return
      latestCanvasJsonRef.current = json

      // Debounce so a burst of strokes coalesces into one snapshot send.
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => sendSnapshot(json), 150)
    },
    [callFrame, isTutor, sendSnapshot],
  )

  const sendWhiteboardStart = useCallback((): boolean => {
    if (!callFrame || !isTutor) return false
    const msg: WhiteboardSignal = { type: 'whiteboard:start' }
    callFrame.sendAppMessage(msg, '*')
    return true
  }, [callFrame, isTutor])

  const sendWhiteboardStop = useCallback((): boolean => {
    if (!callFrame || !isTutor) return false
    const msg: WhiteboardSignal = { type: 'whiteboard:stop' }
    callFrame.sendAppMessage(msg, '*')
    return true
  }, [callFrame, isTutor])

  useEffect(() => {
    if (!callFrame) return

    const handleAppMessage = (event: DailyEventObjectAppMessage | undefined) => {
      if (!event) return
      const msg = event.data as WhiteboardMessage
      if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('whiteboard:')) return

      switch (msg.type) {
        case 'whiteboard:chunk': {
          if (isTutor) break // tutor is the sender; ignore its own broadcast
          const c = msg as WhiteboardChunk
          let buf = bufRef.current
          // A new snapshot id supersedes any older, still-incomplete one.
          if (!buf || buf.mid !== c.mid) {
            buf = { mid: c.mid, n: c.n, parts: new Array(c.n), count: 0 }
            bufRef.current = buf
          }
          if (buf.parts[c.i] === undefined) {
            buf.parts[c.i] = c.data
            buf.count++
          }
          if (buf.count === buf.n) {
            const full = buf.parts.join('')
            bufRef.current = null
            // Receiving a snapshot implies the whiteboard is active — make sure
            // it's visible (covers a late-joining / reconnecting student).
            onWhiteboardStarted?.()
            onRemoteStateReceived?.(full)
          }
          break
        }
        case 'whiteboard:start':
          if (!isTutor) onWhiteboardStarted?.()
          break
        case 'whiteboard:stop':
          if (!isTutor) onWhiteboardStopped?.()
          break
        case 'whiteboard:request-state':
          // A (re)joining student asks for the current board. The reply used
          // to be purely content-driven — send a snapshot if one exists, say
          // nothing otherwise — which gets both toggle states wrong:
          //   - board OFF but drawn-on earlier: latestCanvasJsonRef still
          //     holds that content, so replaying it made the student's panel
          //     open with stale drawings while the tutor's own view stayed
          //     hidden.
          //   - board ON but still blank: there's no snapshot to send (no
          //     stroke has happened yet), so the student got no reply at all
          //     and saw nothing while the tutor talked over a visibly open
          //     board.
          // Replying with the actual on/off state first — mirroring the live
          // toggle broadcast from sendWhiteboardStart/Stop — fixes both: the
          // student's board opens only when the tutor's really is open, even
          // if there's nothing drawn on it yet, and never reopens from a
          // stale snapshot after the tutor has turned it off.
          if (isTutor) {
            if (isActiveRef.current) {
              const startMsg: WhiteboardSignal = { type: 'whiteboard:start' }
              callFrame.sendAppMessage(startMsg, '*')
              if (latestCanvasJsonRef.current) sendSnapshot(latestCanvasJsonRef.current)
            } else {
              const stopMsg: WhiteboardSignal = { type: 'whiteboard:stop' }
              callFrame.sendAppMessage(stopMsg, '*')
            }
          }
          break
      }
    }

    callFrame.on('app-message', handleAppMessage)

    // Student: request the current board on mount (covers a late join).
    if (!isTutor) {
      const requestMsg: WhiteboardSignal = { type: 'whiteboard:request-state' }
      callFrame.sendAppMessage(requestMsg, '*')
    }

    return () => {
      callFrame.off('app-message', handleAppMessage)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [callFrame, isTutor, sendSnapshot, onRemoteStateReceived, onWhiteboardStarted, onWhiteboardStopped])

  return { sendCanvasState, sendWhiteboardStart, sendWhiteboardStop }
}
