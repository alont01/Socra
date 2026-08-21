/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    integrationCheck: { findMany: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
  },
}))
jest.mock('@/lib/metrics', () => ({ recordEvent: jest.fn() }))
jest.mock('@/lib/email', () => ({ sendEmail: jest.fn(), integrationAlertEmailHtml: jest.fn(() => '<html/>') }))
jest.mock('@/lib/integrations', () => ({
  checkIntegrations: jest.fn(),
  overallStatus: jest.requireActual('@/lib/integrations').overallStatus,
}))

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { checkIntegrations } from '@/lib/integrations'
import { runIntegrationMonitor } from '@/lib/integration-monitor'
import type { IntegrationResult } from '@/lib/integrations'

const p = prisma as unknown as {
  integrationCheck: { findMany: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock }
}
const mockCheck = checkIntegrations as jest.Mock
const mockSend = sendEmail as jest.Mock

const result = (over: Partial<IntegrationResult> = {}): IntegrationResult => ({
  key: 'anthropic',
  label: 'Anthropic (Claude)',
  status: 'ok',
  detail: 'Key accepted',
  impact: 'AI stops',
  required: true,
  durationMs: 42,
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  p.integrationCheck.upsert.mockResolvedValue({})
  p.integrationCheck.updateMany.mockResolvedValue({ count: 1 })
  mockSend.mockResolvedValue(true)
})
afterEach(() => jest.restoreAllMocks())

describe('runIntegrationMonitor', () => {
  it('alerts when a healthy integration breaks', async () => {
    p.integrationCheck.findMany.mockResolvedValue([{ key: 'anthropic', status: 'ok', lastOkAt: new Date() }])
    mockCheck.mockResolvedValue([result({ status: 'unauthorized' })])

    const out = await runIntegrationMonitor()

    expect(out.transitions).toEqual([{ key: 'anthropic', from: 'ok', to: 'unauthorized' }])
    expect(out.alertSent).toBe(true)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('Anthropic') }),
    )
  })

  it('does NOT alert again while the same failure persists', async () => {
    // The whole reason the state table exists: an hourly probe that mailed on
    // every failing run would be filtered within a week.
    p.integrationCheck.findMany.mockResolvedValue([
      { key: 'anthropic', status: 'unauthorized', lastOkAt: new Date('2026-08-01') },
    ])
    mockCheck.mockResolvedValue([result({ status: 'unauthorized' })])

    const out = await runIntegrationMonitor()

    expect(out.transitions).toEqual([])
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('alerts on recovery', async () => {
    p.integrationCheck.findMany.mockResolvedValue([{ key: 'anthropic', status: 'unreachable', lastOkAt: null }])
    mockCheck.mockResolvedValue([result({ status: 'ok' })])

    const out = await runIntegrationMonitor()

    expect(out.transitions).toEqual([{ key: 'anthropic', from: 'unreachable', to: 'ok' }])
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('recovered') }),
    )
  })

  it('stays silent on a first-ever check that is healthy', async () => {
    // Otherwise the first deploy mails that everything "changed" to working.
    p.integrationCheck.findMany.mockResolvedValue([])
    mockCheck.mockResolvedValue([result({ status: 'ok' })])

    const out = await runIntegrationMonitor()

    expect(out.transitions).toEqual([])
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('alerts on a first-ever check that is already broken', async () => {
    p.integrationCheck.findMany.mockResolvedValue([])
    mockCheck.mockResolvedValue([result({ status: 'not_configured' })])

    const out = await runIntegrationMonitor()

    expect(out.transitions).toEqual([{ key: 'anthropic', from: null, to: 'not_configured' }])
    expect(mockSend).toHaveBeenCalled()
  })

  it('records lastOkAt only while healthy, preserving it during an outage', async () => {
    const previouslyOk = new Date('2026-08-20T10:00:00Z')
    p.integrationCheck.findMany.mockResolvedValue([
      { key: 'anthropic', status: 'ok', lastOkAt: previouslyOk },
    ])
    mockCheck.mockResolvedValue([result({ status: 'unreachable' })])

    await runIntegrationMonitor()

    // Preserved, so the dashboard can say how long it's been down.
    expect(p.integrationCheck.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ lastOkAt: previouslyOk }) }),
    )
  })

  it('does not stamp alertedAt when the alert email fails to send', async () => {
    // Leaving it unstamped is what lets the next run retry — important because
    // Resend itself may be the broken integration.
    p.integrationCheck.findMany.mockResolvedValue([{ key: 'anthropic', status: 'ok', lastOkAt: new Date() }])
    mockCheck.mockResolvedValue([result({ status: 'unauthorized' })])
    mockSend.mockResolvedValue(false)

    const out = await runIntegrationMonitor()

    expect(out.alertSent).toBe(false)
    expect(p.integrationCheck.updateMany).not.toHaveBeenCalled()
  })

  it('reports down for a broken required dependency and degraded for an optional one', async () => {
    p.integrationCheck.findMany.mockResolvedValue([])

    mockCheck.mockResolvedValue([result({ status: 'unauthorized', required: true })])
    expect((await runIntegrationMonitor()).overall).toBe('down')

    mockCheck.mockResolvedValue([result({ key: 'stripe', status: 'not_configured', required: false })])
    expect((await runIntegrationMonitor()).overall).toBe('degraded')
  })

  it('sends one email covering several simultaneous transitions', async () => {
    p.integrationCheck.findMany.mockResolvedValue([
      { key: 'anthropic', status: 'ok', lastOkAt: new Date() },
      { key: 'daily', status: 'ok', lastOkAt: new Date() },
    ])
    mockCheck.mockResolvedValue([
      result({ key: 'anthropic', status: 'unreachable' }),
      result({ key: 'daily', label: 'Daily.co (video)', status: 'unreachable' }),
    ])

    const out = await runIntegrationMonitor()

    expect(out.transitions).toHaveLength(2)
    expect(mockSend).toHaveBeenCalledTimes(1)
  })
})

describe('runIntegrationMonitor when the state store is unreachable', () => {
  // The database is one of the things being monitored, so a DB outage must
  // still yield a report and an alert — not a 500 that explains nothing.
  const dbDown = new Error('Can’t reach database server')

  it('still reports and alerts when the state table cannot be read', async () => {
    p.integrationCheck.findMany.mockRejectedValue(dbDown)
    p.integrationCheck.upsert.mockRejectedValue(dbDown)
    mockCheck.mockResolvedValue([
      result({ key: 'database', label: 'PostgreSQL', status: 'unreachable' }),
    ])

    const out = await runIntegrationMonitor()

    expect(out.stateUnavailable).toBe(true)
    expect(out.overall).toBe('down')
    expect(out.transitions).toEqual([{ key: 'database', from: null, to: 'unreachable' }])
    expect(mockSend).toHaveBeenCalled()
  })

  it('does not try to stamp alertedAt when the store is unreachable', async () => {
    p.integrationCheck.findMany.mockRejectedValue(dbDown)
    p.integrationCheck.upsert.mockRejectedValue(dbDown)
    mockCheck.mockResolvedValue([result({ status: 'unreachable' })])

    await runIntegrationMonitor()

    expect(p.integrationCheck.updateMany).not.toHaveBeenCalled()
  })

  it('reports healthy integrations normally even if persistence fails', async () => {
    p.integrationCheck.findMany.mockResolvedValue([])
    p.integrationCheck.upsert.mockRejectedValue(new Error('write timeout'))
    mockCheck.mockResolvedValue([result({ status: 'ok' })])

    const out = await runIntegrationMonitor()

    expect(out.overall).toBe('ok')
    expect(out.stateUnavailable).toBe(true)
    expect(mockSend).not.toHaveBeenCalled()
  })
})
