// Suggested sign-in credentials for a parent-created student account.
//
// These are real credentials for a real account, and most parents accept the
// suggestion rather than typing their own, so they must not be predictable.
// They also have to be readable enough for a parent to relay to a child out
// loud, which rules out opaque high-entropy strings.

const WORDS = [
  'tiger', 'comet', 'maple', 'river', 'pixel', 'mango', 'orbit', 'delta',
  'cedar', 'lunar', 'ember', 'quartz', 'harbor', 'summit', 'willow', 'cobalt',
]

/**
 * Uniformly random integer in [0, max).
 *
 * Uses the platform CSPRNG rather than Math.random(), which is seeded
 * predictably and is not safe for anything credential-shaped.
 */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0) throw new RangeError('max must be a positive integer')
  const buf = new Uint32Array(1)
  // Reject the short tail at the top of the range that would otherwise make
  // low values very slightly more likely than high ones.
  const limit = Math.floor(0x1_0000_0000 / max) * max
  do {
    crypto.getRandomValues(buf)
  } while (buf[0] >= limit)
  return buf[0] % max
}

/**
 * A readable passphrase: two words plus four digits.
 *
 * 16 × 16 × 9000 ≈ 2.3M combinations. The previous single-word form had 8 ×
 * 9000 = 72k, which is trivially brute-forceable against a login endpoint.
 */
export function suggestPassword(): string {
  const a = WORDS[randomInt(WORDS.length)]
  const b = WORDS[randomInt(WORDS.length)]
  return `${a}-${b}${1000 + randomInt(9000)}`
}

/** A username suggestion derived from the child's first name. */
export function slugFromName(name: string): string {
  const base = name.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z0-9]/g, '') || ''
  return base ? `${base}${10 + randomInt(90)}` : ''
}
