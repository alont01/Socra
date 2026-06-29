'use client'

import { useMemo } from 'react'
import { sanitizeSvg } from '@/lib/sanitizeSvg'

/**
 * Renders an AI-generated geometry figure (inline SVG) after sanitizing it.
 * Sanitization runs client-side via DOMParser; during SSR this renders nothing
 * and fills in after hydration.
 */
export function SvgFigure({ svg }: { svg: string }) {
  const clean = useMemo(() => sanitizeSvg(svg), [svg])

  if (!clean) {
    return (
      <div className="my-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-400">
        Could not render figure.
      </div>
    )
  }

  return (
    <div
      className="my-2 flex justify-center rounded-lg border border-orange-100 bg-white p-2 [&>svg]:h-auto [&>svg]:max-w-full"
      // Sanitized above — safe to inject.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
