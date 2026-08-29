'use client'

import { useEffect, useRef, useState } from 'react'

interface ProgressBarProps {
  /** While true the bar advances; on the falling edge it completes and fades. */
  active: boolean
  /** Roughly how long the work usually takes. Pacing only — never a deadline. */
  estimatedMs?: number
  label?: string
  className?: string
}

const CEILING = 0.92

/**
 * Progress bar for work of unknown duration — an AI generation, typically.
 *
 * There is no real percentage to report: the model takes as long as it takes.
 * So the bar eases toward a ceiling it never reaches on its own, decelerating
 * as it goes, and only snaps to 100% when the work actually lands. That reads
 * as progress without claiming precision it doesn't have, and it can't do the
 * thing a naive timed bar does — sit at 100% while the user keeps waiting.
 */
export function ProgressBar({ active, estimatedMs = 12000, label, className = '' }: ProgressBarProps) {
  const [pct, setPct] = useState(0)
  const [visible, setVisible] = useState(false)
  const startedAt = useRef<number>(0)

  useEffect(() => {
    if (!active) return
    setVisible(true)
    setPct(0)
    startedAt.current = Date.now()

    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt.current
      // Exponential ease-out: fast at first, asymptotic to CEILING. Overrunning
      // the estimate slows the bar down rather than stalling it outright.
      setPct(CEILING * (1 - Math.exp((-3 * elapsed) / estimatedMs)))
    }, 120)

    return () => clearInterval(timer)
  }, [active, estimatedMs])

  // Falling edge: fill to 100%, hold briefly so the completion is legible, hide.
  useEffect(() => {
    if (active || !visible) return
    setPct(1)
    const timer = setTimeout(() => setVisible(false), 400)
    return () => clearTimeout(timer)
  }, [active, visible])

  if (!visible) return null

  return (
    <div className={className}>
      {label && <p className="text-xs text-stone-500 mb-1.5">{label}</p>}
      <div
        className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden"
        role="progressbar"
        aria-busy={active}
        aria-label={label || 'Loading'}
      >
        <div
          className="h-full rounded-full bg-orange-500 transition-[width] duration-150 ease-out"
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
  )
}
