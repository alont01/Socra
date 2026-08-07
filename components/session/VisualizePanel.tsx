'use client'

import { useCallback, useEffect, useState } from 'react'
import { buildSpecSvgs, type DrawSpec } from '@/lib/whiteboard-draw'
import { Button } from '@/components/ui/Button'

interface VisualizeContext {
  transcript: string
  notes: string
  whiteboardImage: string | null
}

interface VisualizePanelProps {
  sessionId: string
  getContext: () => VisualizeContext
  onPlace: (svgs: string[]) => Promise<void> | void
  onClose: () => void
}

function svgToDataUrl(svg: string) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

// Tutor-only. Generates an AI visualization, previews it privately (the student
// does NOT see it yet), lets the tutor refine it by typing, and only places it
// on the shared whiteboard on confirm.
export function VisualizePanel({ sessionId, getContext, onPlace, onClose }: VisualizePanelProps) {
  const [spec, setSpec] = useState<DrawSpec | null>(null)
  const [svgs, setSvgs] = useState<string[]>([])
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')

  const generate = useCallback(
    async (opts: { instruction?: string; currentSpec?: DrawSpec | null }) => {
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
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.error || 'Could not generate a visualization.')
          return
        }
        const newSpec = data.spec as DrawSpec
        setSpec(newSpec)
        try {
          setSvgs(buildSpecSvgs(newSpec))
        } catch {
          setSvgs([])
          setError('The visualization could not be rendered. Try a different instruction.')
        }
        setInstruction('')
      } catch {
        setError('Network error. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    [sessionId, getContext],
  )

  // Kick off an initial generation from the current conversation on open.
  useEffect(() => {
    generate({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const confirm = async () => {
    if (svgs.length === 0) return
    setPlacing(true)
    try {
      await onPlace(svgs)
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
          ) : svgs.length > 0 ? (
            <div className="space-y-3">
              {svgs.map((svg, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={svgToDataUrl(svg)} alt={`Visualization ${i + 1}`} className="w-full rounded-xl ring-1 ring-stone-200 bg-white" />
              ))}
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
            <Button onClick={confirm} loading={placing} disabled={loading || svgs.length === 0}>
              Place on whiteboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
