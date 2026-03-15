import { config } from '@/lib/config'

describe('config', () => {
  it('has mastery alpha between 0 and 1', () => {
    expect(config.mastery.alpha).toBeGreaterThan(0)
    expect(config.mastery.alpha).toBeLessThanOrEqual(1)
  })

  it('has positive session coverage values', () => {
    expect(config.mastery.initialSessionCoverage).toBeGreaterThan(0)
    expect(config.mastery.sessionCoverageIncrement).toBeGreaterThan(0)
  })

  it('has positive daily room expiry', () => {
    expect(config.daily.roomExpirySeconds).toBeGreaterThan(0)
  })

  it('has valid AI model strings', () => {
    expect(config.ai.analysisModel).toContain('claude')
    expect(config.ai.practiceModel).toContain('claude')
  })

  it('has positive max tokens', () => {
    expect(config.ai.analysisMaxTokens).toBeGreaterThan(0)
    expect(config.ai.practiceMaxTokens).toBeGreaterThan(0)
  })

  it('has positive auth JWT expiry', () => {
    expect(config.auth.jwtExpirySeconds).toBeGreaterThan(0)
  })
})
