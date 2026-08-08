/**
 * @jest-environment node
 */
jest.mock('@/lib/prisma', () => ({
  prisma: { systemEvent: { create: jest.fn(), deleteMany: jest.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { trackedCall, pruneOldEvents } from '@/lib/metrics'

const create = (prisma as unknown as { systemEvent: { create: jest.Mock } }).systemEvent.create
const deleteMany = (prisma as unknown as { systemEvent: { deleteMany: jest.Mock } }).systemEvent.deleteMany

beforeEach(() => {
  create.mockReset().mockResolvedValue({})
  deleteMany.mockReset().mockResolvedValue({ count: 3 })
})

describe('trackedCall', () => {
  it('returns the result and records a success event', async () => {
    const result = await trackedCall({ category: 'daily', name: 'daily.rooms' }, async () => 42)
    expect(result).toBe(42)
    expect(create).toHaveBeenCalledTimes(1)
    const data = create.mock.calls[0][0].data
    expect(data).toMatchObject({ category: 'daily', name: 'daily.rooms', success: true })
    expect(typeof data.durationMs).toBe('number')
  })

  it('records a failure event and rethrows', async () => {
    await expect(
      trackedCall({ category: 'email', name: 'email.send' }, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(create).toHaveBeenCalledTimes(1)
    const data = create.mock.calls[0][0].data
    expect(data).toMatchObject({ category: 'email', name: 'email.send', success: false, level: 'error' })
    expect(data.metadata).toContain('boom')
  })
})

describe('pruneOldEvents', () => {
  it('deletes events older than the cutoff and returns the count', async () => {
    const removed = await pruneOldEvents(30)
    expect(removed).toBe(3)
    const where = deleteMany.mock.calls[0][0].where
    expect(where.createdAt.lt).toBeInstanceOf(Date)
  })
})
