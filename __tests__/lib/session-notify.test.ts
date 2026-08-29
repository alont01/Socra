/**
 * Guards the one thing this module must never get wrong: the time it tells a
 * family to show up. Node inherits the host timezone (UTC on Render), so these
 * run with TZ forced to something else — if the formatter ever loses its
 * explicit zone again, this suite fails instead of the parent.
 */
import { formatWhenForTest as formatWhen } from '@/lib/session-notify'

describe('session time formatting', () => {
  const original = process.env.TZ

  afterEach(() => { process.env.TZ = original })

  it('renders in the app timezone, not the host timezone', () => {
    // 2026-09-15T20:00Z is 4:00 PM in America/New_York (EDT).
    const at = new Date('2026-09-15T20:00:00Z')
    expect(formatWhen(at)).toContain('4:00 PM')
    expect(formatWhen(at)).toContain('Tuesday')
  })

  it('names the zone so the time is unambiguous', () => {
    expect(formatWhen(new Date('2026-09-15T20:00:00Z'))).toMatch(/E[DS]T$/)
  })

  it('handles standard time on the other side of the DST boundary', () => {
    // 2026-12-15T21:00Z is 4:00 PM EST.
    const at = new Date('2026-12-15T21:00:00Z')
    expect(at.getTime()).toBeGreaterThan(0)
    expect(formatWhen(at)).toContain('4:00 PM')
    expect(formatWhen(at)).toContain('EST')
  })

  it('falls back gracefully when no time is set', () => {
    expect(formatWhen(null)).toBe('Time to be confirmed')
  })
})
