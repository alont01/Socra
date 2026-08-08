// Pure logic for the adaptive diagnostic assessment: difficulty-ladder
// progression, convergence/stop detection, and grading resolution. No I/O —
// kept separate from the API routes and AI calls so it's directly unit
// testable.

import { config } from '@/lib/config'

export type ItemOutcome = 'correct' | 'incorrect' | 'worked_together'

const { minLevel, maxLevel, startLevel, maxItems, convergenceWindow, convergenceRange } =
  config.assessment

function clampLevel(level: number): number {
  return Math.min(maxLevel, Math.max(minLevel, level))
}

/**
 * Pick the starting difficulty for a topic. Uses the student's existing
 * mastery (0-1) for a matching topic if one exists — mapped onto the 1-10
 * ladder — otherwise falls back to the configured mid-point. Matching is a
 * loose substring check (mirrors the live-practice weak-area matching), since
 * mastery topics and assessment topics aren't a rigid enum.
 */
export function initialLevel(masteryData: { topic: string; mastery: number }[], topic: string): number {
  const needle = topic.trim().toLowerCase()
  if (!needle) return startLevel
  const match = masteryData.find(
    (m) => m.topic.toLowerCase().includes(needle) || needle.includes(m.topic.toLowerCase()),
  )
  if (!match) return startLevel
  // mastery 0..1 -> level 1..10, rounded.
  return clampLevel(Math.round(1 + match.mastery * (maxLevel - minLevel)))
}

/** Next ladder position given how the current item resolved. */
export function nextLevel(currentLevel: number, outcome: ItemOutcome): number {
  if (outcome === 'correct') return clampLevel(currentLevel + 1)
  if (outcome === 'incorrect') return clampLevel(currentLevel - 1)
  return clampLevel(currentLevel) // worked_together: hold position, ambiguous signal
}

/**
 * Whether the assessment should stop after this item: the max item count is
 * reached, or the last `convergenceWindow` levels have settled into a band of
 * `convergenceRange` (the student's level is confidently pinned down, no need
 * to burn through all 10 problems).
 */
export function shouldStop(levelHistory: number[], itemCount: number): boolean {
  if (itemCount >= maxItems) return true
  if (levelHistory.length < convergenceWindow) return false
  const recent = levelHistory.slice(-convergenceWindow)
  const range = Math.max(...recent) - Math.min(...recent)
  return range <= convergenceRange
}

/** Resolve the recorded outcome for an item: a tutor override always wins. */
export function resolveOutcome(autoCorrect: boolean | null, tutorResult: string | null): ItemOutcome | null {
  if (tutorResult === 'correct' || tutorResult === 'incorrect' || tutorResult === 'worked_together') {
    return tutorResult
  }
  if (autoCorrect === true) return 'correct'
  if (autoCorrect === false) return 'incorrect'
  return null
}

/** finalCorrect stored on the item: true/false, or null for the ambiguous "worked together" case. */
export function finalCorrectFromOutcome(outcome: ItemOutcome | null): boolean | null {
  if (outcome === 'correct') return true
  if (outcome === 'incorrect') return false
  return null // worked_together, or not yet graded
}

/** Rough 1-10 -> 0-1 mastery mapping used to seed StudentProgress on completion. */
export function levelToMastery(level: number): number {
  return clampLevel(level) / maxLevel
}
