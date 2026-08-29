'use client'

import { useEffect, useState } from 'react'
import { sanitizeSvg } from '@/lib/sanitizeSvg'

/**
 * Renders an AI-generated geometry figure (inline SVG) after sanitizing it.
 *
 * Sanitization needs DOMParser, so it can only run in the browser. That makes
 * three states, not two, and collapsing the first two is what caused a bug:
 * "not sanitized yet" (server render and the first client render) is not the
 * same as "sanitization failed". Treating them alike made the server emit
 * "Could not render figure." while the client emitted the figure — a hydration
 * mismatch, and a failure message shown for every valid figure until React
 * caught up.
 *
 * The placeholder below is what both the server and the first client render
 * produce, so hydration matches; the effect then fills in the real result.
 */
export function SvgFigure({ svg }: { svg: string }) {
  const [result, setResult] = useState<{ clean: string | null } | null>(null)

  useEffect(() => {
    setResult({ clean: sanitizeSvg(svg) })
  }, [svg])

  // Not sanitized yet. Reserve the space rather than announcing a failure that
  // hasn't happened.
  if (!result) {
    return <div className="my-2 h-24 rounded-lg bg-stone-50 ring-1 ring-stone-900/5" aria-hidden />
  }

  if (!result.clean) {
    return (
      <div className="my-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-400">
        Could not render figure.
      </div>
    )
  }

  return (
    <div
      className="my-2 flex justify-center rounded-lg ring-1 ring-stone-900/5 bg-white p-2 [&>svg]:h-auto [&>svg]:max-w-full"
      // Sanitized above — safe to inject.
      dangerouslySetInnerHTML={{ __html: result.clean }}
    />
  )
}
