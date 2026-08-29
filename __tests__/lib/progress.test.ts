import { Prisma } from '@prisma/client'

const tx = {
  studentProgress: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  masteryHistory: { create: jest.fn() },
}
const $transaction = jest.fn()

jest.mock('@/lib/prisma', () => ({ prisma: { $transaction: (...a: unknown[]) => $transaction(...a) } }))

import { applyMastery, updateMasteryScore } from '@/lib/progress'

const conflict = () =>
  new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034',
    clientVersion: 'test',
  })

/** Run the callback the way Prisma would, against the mocked tx. */
const runsTransaction = () => $transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx))

beforeEach(() => {
  jest.clearAllMocks()
  tx.studentProgress.findUnique.mockResolvedValue(null)
  runsTransaction()
})

describe('applyMastery', () => {
  it('runs Serializable — READ COMMITTED would let a concurrent write be lost', async () => {
    await applyMastery('s1', 'algebra', 'practice', () => 0.5)
    expect($transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  })

  it('passes null for a topic with no prior mastery, and creates the row', async () => {
    const compute = jest.fn().mockReturnValue(0.3)
    await applyMastery('s1', 'algebra', 'session', compute)
    expect(compute).toHaveBeenCalledWith(null)
    expect(tx.studentProgress.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mastery: 0.3 }) }),
    )
  })

  it('passes the current mastery when a row exists, and updates it', async () => {
    tx.studentProgress.findUnique.mockResolvedValue({ id: 'p1', mastery: 0.4 })
    const compute = jest.fn().mockReturnValue(0.6)
    await applyMastery('s1', 'algebra', 'practice', compute)
    expect(compute).toHaveBeenCalledWith(0.4)
    expect(tx.studentProgress.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { mastery: 0.6 } })
  })

  it('clamps whatever compute returns into [0,1]', async () => {
    await applyMastery('s1', 'algebra', 'session', () => 9)
    expect(tx.studentProgress.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mastery: 1 }) }),
    )
    jest.clearAllMocks()
    runsTransaction()
    tx.studentProgress.findUnique.mockResolvedValue(null)
    await applyMastery('s1', 'algebra', 'session', () => -4)
    expect(tx.studentProgress.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mastery: 0 }) }),
    )
  })

  it('records the source on the history row', async () => {
    await applyMastery('s1', 'algebra', 'assessment', () => 0.5)
    expect(tx.masteryHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'assessment' }) }),
    )
  })

  it('retries a write conflict and succeeds', async () => {
    let calls = 0
    $transaction.mockImplementation(async (fn: (t: unknown) => unknown) => {
      if (++calls < 3) throw conflict()
      return fn(tx)
    })
    await applyMastery('s1', 'algebra', 'practice', () => 0.5)
    expect(calls).toBe(3)
    expect(tx.studentProgress.create).toHaveBeenCalledTimes(1)
  })

  it('gives up after repeated conflicts rather than looping forever', async () => {
    $transaction.mockImplementation(async () => { throw conflict() })
    await expect(applyMastery('s1', 'algebra', 'practice', () => 0.5)).rejects.toMatchObject({ code: 'P2034' })
  })

  it('does not retry an unrelated failure', async () => {
    let calls = 0
    $transaction.mockImplementation(async () => { calls++; throw new Error('connection lost') })
    await expect(applyMastery('s1', 'algebra', 'practice', () => 0.5)).rejects.toThrow('connection lost')
    expect(calls).toBe(1)
  })
})

describe('updateMasteryScore', () => {
  it('seeds a new topic at alpha for a correct answer', async () => {
    await updateMasteryScore('s1', 'algebra', true)
    expect(tx.studentProgress.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mastery: 0.3 }) }),
    )
  })

  it('blends toward 1 on a correct answer', async () => {
    tx.studentProgress.findUnique.mockResolvedValue({ id: 'p1', mastery: 0.5 })
    await updateMasteryScore('s1', 'algebra', true)
    // 0.3*1 + 0.7*0.5 — float math, so compare with tolerance
    expect(tx.studentProgress.update.mock.calls[0][0].data.mastery).toBeCloseTo(0.65, 10)
  })

  it('blends toward 0 on a wrong answer', async () => {
    tx.studentProgress.findUnique.mockResolvedValue({ id: 'p1', mastery: 0.5 })
    await updateMasteryScore('s1', 'algebra', false)
    expect(tx.studentProgress.update.mock.calls[0][0].data.mastery).toBeCloseTo(0.35, 10)
  })
})
