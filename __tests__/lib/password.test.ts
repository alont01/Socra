import { hashPassword, comparePassword } from '@/lib/password'

describe('password utilities', () => {
  describe('hashPassword', () => {
    it('returns a hash string different from the input', async () => {
      const password = 'mySecretPassword123'
      const hash = await hashPassword(password)
      expect(typeof hash).toBe('string')
      expect(hash).not.toBe(password)
    })

    it('returns a bcrypt hash (starts with $2)', async () => {
      const hash = await hashPassword('testpassword')
      expect(hash).toMatch(/^\$2[aby]\$/)
    })

    it('returns different hashes for the same input (salted)', async () => {
      const password = 'samePassword'
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)
      expect(hash1).not.toBe(hash2)
    })

    it('produces a hash of expected bcrypt length', async () => {
      const hash = await hashPassword('anotherPassword')
      // bcrypt hashes are 60 characters long
      expect(hash.length).toBe(60)
    })
  })

  describe('comparePassword', () => {
    it('returns true for a matching password and its hash', async () => {
      const password = 'correctPassword'
      const hash = await hashPassword(password)
      const result = await comparePassword(password, hash)
      expect(result).toBe(true)
    })

    it('returns false for a wrong password', async () => {
      const hash = await hashPassword('correctPassword')
      const result = await comparePassword('wrongPassword', hash)
      expect(result).toBe(false)
    })

    it('returns false for a different user\'s hash', async () => {
      const hash1 = await hashPassword('user1Password')
      const result = await comparePassword('user2Password', hash1)
      expect(result).toBe(false)
    })

    it('returns false for an empty string against a real hash', async () => {
      const hash = await hashPassword('realPassword')
      const result = await comparePassword('', hash)
      expect(result).toBe(false)
    })

    it('is case sensitive', async () => {
      const hash = await hashPassword('Password')
      const result = await comparePassword('password', hash)
      expect(result).toBe(false)
    })
  })
})
