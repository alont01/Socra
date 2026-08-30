'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildSpecFrames, type DrawSpec, type Frame } from '@/lib/whiteboard-draw'
import { Button } from '@/components/ui/Button'

interface VisualizeContext {
  transcript: string
  notes: string
  whiteboardImage: string | null
}

interface VisualizePanelProps {
  sessionId: string
  getContext: () => VisualizeContext
  onPlace: (svgs: string[], opts?: { replaceGroup?: string }) => Promise<void> | void
  onClose: () => void
}

function svgToDataUrl(svg: string) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

// The heaviest AI call in the app (visualizeMaxTokens: 16000, plus a
// whiteboard image in the payload) with nothing else here able to time out
// on its own. Without a ceiling, a slow or stuck call leaves the tutor
// staring at "Reading the conversation…" indefinitely, live with a student.
const GENERATE_TIMEOUT_MS = 45_000

// Tutor-only. Generates an AI visualization, previews it privately (the student
// does NOT see it yet), lets the tutor refine it by typing, and only places it
// on the shared whiteboard on confirm.
export function VisualizePanel({ sessionId, getContext, onPlace, onClose }: VisualizePanelProps) {
  const [spec, setSpec] = useState<DrawSpec | null>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [current, setCurrent] = useState(0)
  // Every reveal from this panel replaces the last one on the board, so a
  // build-up advances in place instead of stacking copies of the figure.
  const groupId = useRef(`viz-${Math.random().toString(36).slice(2)}`).current
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')
  // Disambiguates a stale response (a superseded call, or one that lands
  // after the panel unmounts) from the one the user is currently waiting on
  // — without this, closing the panel mid-generation and reopening it (or
  // typing a second instruction before the first reply lands) could apply an
  // old response's spec on top of newer state.
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const generate = useCallback(
    async (opts: { instruction?: string; currentSpec?: DrawSpec | null }) => {
      const myRequestId = ++requestIdRef.current
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)

      setLoading(true)
      setError('')
      try {
        const ctx = getContext()
        const res = await fetch(`/api/tutoring-sessions/${sessionId}/visualize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: ctx.transcript,
            notes: ctx.notes,
            whiteboardImage: ctx.whiteboardImage || undefined,
            hint: opts.currentSpec ? undefined : opts.instruction || undefined,
            instruction: opts.currentSpec ? opts.instruction : undefined,
            currentSpec: opts.currentSpec || undefined,
          }),
          signal: controller.signal,
        })
        if (!mountedRef.current || requestIdRef.current !== myRequestId) return

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.error || 'Could not generate a visualization.')
          return
        }
        const newSpec = data.spec as DrawSpec
        setSpec(newSpec)
        try {
          setFrames(buildSpecFrames(newSpec))
          setCurrent(0)
        } catch {
          setFrames([])
          setError('The visualization could not be rendered. Try a different instruction.')
        }
        setInstruction('')
      } catch {
        if (!mountedRef.current || requestIdRef.current !== myRequestId) return
        setError(
          controller.signal.aborted
            ? 'This is taking longer than expected. Try again, or try a simpler instruction.'
            : 'Network error. Please try again.',
        )
      } finally {
        clearTimeout(timeout)
        if (mountedRef.current && requestIdRef.current === myRequestId) setLoading(false)
      }
    },
    [sessionId, getContext],
  )

  // Kick off an initial generation from the current conversation on open.
  useEffect(() => {
    generate({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reveal the step being previewed, then move to the next one. The tutor talks
  // over each beat, so the panel stays open until the explanation is finished.
  const reveal = async () => {
    const frame = frames[current]
    if (!frame) return
    setPlacing(true)
    try {
      await onPlace([frame.svg], { replaceGroup: groupId })
      if (current + 1 < frames.length) setCurrent(current + 1)
      else onClose()
    } finally {
      setPlacing(false)
    }
  }

  const placeAll = async () => {
    if (frames.length === 0) return
    setPlacing(true)
    try {
      await onPlace(frames.map((f) => f.svg), { replaceGroup: groupId })
      onClose()
    } finally {
      setPlacing(false)
    }
  }

  const isModify = !!spec
  const submitInstruction = (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    generate({ instruction: instruction.trim() || undefined, currentSpec: isModify ? spec : null })
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-900/40 p-4" role="dialog" aria-modal="true" aria-label="AI visualization preview">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-elevated ring-1 ring-stone-900/10 flex flex-col max-h-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <span className="text-orange-500">✦</span>
            <h2 className="font-semibold text-stone-900">AI visualization</h2>
            <span className="text-xs text-stone-400">preview — only you can see this</span>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-sm px-2" aria-label="Close">✕</button>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-5 bg-stone-50 min-h-[180px]">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center py-12 text-stone-400 text-sm gap-3">
              <span className="h-6 w-6 rounded-full border-2 border-stone-300 border-t-orange-500 animate-spin" />
              Reading the conversation…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 py-6 text-center">{error}</p>
          ) : frames.length > 0 ? (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={svgToDataUrl(frames[current].svg)}
                alt={frames[current].caption || `Step ${current + 1} of ${frames.length}`}
                className="w-full rounded-xl ring-1 ring-stone-200 bg-white"
              />
              {frames.length > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setCurrent((i) => Math.max(0, i - 1))}
                    disabled={current === 0}
                    className="text-sm text-stone-500 hover:text-stone-800 disabled:opacity-30 px-2 py-1"
                  >
                    ← Back
                  </button>
                  <div className="flex items-center gap-1.5" role="tablist" aria-label="Explanation steps">
                    {frames.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrent(i)}
                        aria-label={`Step ${i + 1}`}
                        aria-selected={i === current}
                        role="tab"
                        className={`h-2 rounded-full transition-all ${i === current ? 'w-5 bg-orange-500' : 'w-2 bg-stone-300 hover:bg-stone-400'}`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setCurrent((i) => Math.min(frames.length - 1, i + 1))}
                    disabled={current === frames.length - 1}
                    className="text-sm text-stone-500 hover:text-stone-800 disabled:opacity-30 px-2 py-1"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-stone-400 py-6 text-center">No visualization yet.</p>
          )}
        </div>

        {/* Modify + actions */}
        <div className="px-5 py-4 border-t border-stone-100 space-y-3">
          <form onSubmit={submitInstruction} className="flex gap-2">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={isModify ? 'Type a change (e.g. "widen the domain", "add the vertex")' : 'Optional: what to focus on'}
              className="flex-1 rounded-xl ring-1 ring-inset ring-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <Button type="submit" variant="ghost" size="sm" loading={loading} disabled={loading}>
              {isModify ? 'Update' : 'Generate'}
            </Button>
          </form>
          <div className="flex items-center justify-between gap-3">
            <button onClick={onClose} className="text-sm text-stone-500 hover:text-stone-700">Discard</button>
            <div className="flex items-center gap-2">
              {frames.length > 1 && (
                <Button onClick={placeAll} variant="ghost" size="sm" disabled={loading || placing}>
                  Place all steps
                </Button>
              )}
              <Button onClick={reveal} loading={placing} disabled={loading || frames.length === 0}>
                {frames.length > 1 ? `Show step ${current + 1} to student` : 'Place on whiteboard'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
